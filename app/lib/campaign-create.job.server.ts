import type { Json } from "~/types/database";
import type { Database } from "~/types/database";
import { decryptMetaAccessToken } from "~/lib/crypto.server";
import {
  createAdPaused,
  createCampaignPaused,
  createAdSetPaused,
  createLinkAdCreative,
  createVideoAdCreative,
  type MetaCampaignObjective,
  normalizeAdAccountId,
  updateCampaignStatus,
  uploadAdImageFromUrl,
  uploadAdVideoFromUrl,
} from "~/lib/meta/campaigns.server";
import { isMetaApiError } from "~/lib/meta/client";
import { getSupabaseAdmin } from "~/lib/supabase.admin.server";
import { NonRetriableError } from "inngest";

type ActivationRow = Database["public"]["Tables"]["campaign_activations"]["Row"];
type TemplateRow = Database["public"]["Tables"]["campaign_templates"]["Row"];
type GeoRow = Database["public"]["Tables"]["allowed_geos"]["Row"];
type AssetRow = Database["public"]["Tables"]["assets"]["Row"];
type MetaConnRow = Database["public"]["Tables"]["meta_connections"]["Row"];

export type CampaignCreateContext = {
  activation: ActivationRow;
  template: TemplateRow;
  geo: GeoRow;
  assets: AssetRow[];
  meta: MetaConnRow;
  accessToken: string;
};

const OBJECTIVES: MetaCampaignObjective[] = [
  "OUTCOME_LEADS",
  "OUTCOME_TRAFFIC",
  "OUTCOME_AWARENESS",
];

function parseObjective(raw: string): MetaCampaignObjective {
  const u = raw.trim().toUpperCase();
  if (OBJECTIVES.includes(u as MetaCampaignObjective)) {
    return u as MetaCampaignObjective;
  }
  return "OUTCOME_TRAFFIC";
}

/** Presupuesto en unidades mínimas de moneda (p. ej. centavos MXN). */
export function parseBudgetToMinorUnits(budget: string): number {
  const n = Number.parseFloat(budget);
  if (!Number.isFinite(n) || n <= 0) {
    throw new NonRetriableError(`Presupuesto inválido para Meta: ${budget}`);
  }
  return Math.round(n * 100);
}

export function buildTargeting(geo: GeoRow) {
  const cc = (geo.country_code ?? "MX").trim().toUpperCase();
  return {
    geo_locations: {
      countries: [cc],
    },
  };
}

export async function loadCampaignCreateContext(
  activationId: string,
): Promise<CampaignCreateContext> {
  const admin = getSupabaseAdmin();

  const { data: activation, error: aErr } = await admin
    .from("campaign_activations")
    .select("*")
    .eq("id", activationId)
    .maybeSingle();

  if (aErr || !activation) {
    throw new NonRetriableError(
      aErr?.message ?? "Activación no encontrada.",
    );
  }

  const [{ data: template, error: tErr }, { data: geo, error: gErr }, { data: meta, error: mErr }] =
    await Promise.all([
      admin
        .from("campaign_templates")
        .select("*")
        .eq("id", activation.template_id)
        .single(),
      admin
        .from("allowed_geos")
        .select("*")
        .eq("id", activation.selected_geo_id)
        .single(),
      admin
        .from("meta_connections")
        .select("*")
        .eq("org_id", activation.org_id)
        .maybeSingle(),
    ]);

  if (tErr || !template) {
    throw new NonRetriableError(tErr?.message ?? "Template no encontrado.");
  }
  if (gErr || !geo) {
    throw new NonRetriableError(gErr?.message ?? "Geo no encontrada.");
  }
  if (mErr || !meta) {
    throw new NonRetriableError(
      "No hay conexión Meta para la organización. Configúrala en Ajustes → Meta.",
    );
  }

  const { data: assets, error: asErr } = await admin
    .from("assets")
    .select("*")
    .eq("template_id", activation.template_id)
    .order("sort_order", { ascending: true });

  if (asErr) {
    throw new NonRetriableError(asErr.message);
  }
  if (!assets?.length) {
    throw new NonRetriableError("El template no tiene assets para publicar.");
  }

  let accessToken: string;
  try {
    accessToken = decryptMetaAccessToken(meta.access_token_encrypted);
  } catch {
    throw new NonRetriableError("No se pudo descifrar el token Meta.");
  }

  return {
    activation,
    template,
    geo,
    assets,
    meta,
    accessToken,
  };
}

function pickPrimaryAsset(assets: AssetRow[]): AssetRow {
  const sorted = [...assets].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
  );
  return sorted[0]!;
}

function buildBaseName(templateName: string, activationId: string): string {
  return `${templateName.slice(0, 80)} · ${activationId.slice(0, 8)}`;
}

/** Idempotente: devuelve meta_campaign_id existente o crea y persiste. */
export async function ensureMetaCampaignStep(
  activationId: string,
): Promise<string> {
  const ctx = await loadCampaignCreateContext(activationId);
  const { activation, template, meta, accessToken } = ctx;
  if (activation.meta_campaign_id) {
    return activation.meta_campaign_id;
  }
  const objective = parseObjective(template.campaign_objective);
  const adAccountId = normalizeAdAccountId(meta.ad_account_id);
  const baseName = buildBaseName(template.name, activationId);
  const campaign = await createCampaignPaused(accessToken, adAccountId, {
    name: `${baseName} (campaña)`,
    objective,
  });
  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();
  const { error } = await admin
    .from("campaign_activations")
    .update({
      meta_campaign_id: campaign.campaignId,
      updated_at: now,
    })
    .eq("id", activationId)
    .eq("org_id", activation.org_id)
    .eq("status", "activating");
  if (error) {
    throw new NonRetriableError(error.message);
  }
  return campaign.campaignId;
}

/** Idempotente: devuelve meta_adset_id existente o crea y persiste. */
export async function ensureMetaAdsetStep(activationId: string): Promise<string> {
  const ctx = await loadCampaignCreateContext(activationId);
  const { activation, template, meta, accessToken, geo } = ctx;
  if (activation.meta_adset_id) {
    return activation.meta_adset_id;
  }
  if (!activation.meta_campaign_id) {
    throw new NonRetriableError(
      "Falta meta_campaign_id; ejecuta primero el paso de campaña.",
    );
  }
  const objective = parseObjective(template.campaign_objective);
  const adAccountId = normalizeAdAccountId(meta.ad_account_id);
  const lifetimeBudget = parseBudgetToMinorUnits(activation.budget);
  const targeting = buildTargeting(geo);
  const baseName = buildBaseName(template.name, activationId);
  const adset = await createAdSetPaused(accessToken, adAccountId, {
    name: `${baseName} (conjunto)`,
    campaignId: activation.meta_campaign_id,
    objective,
    lifetimeBudgetMinorUnits: lifetimeBudget,
    targeting,
  });
  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();
  const { error } = await admin
    .from("campaign_activations")
    .update({
      meta_adset_id: adset.adsetId,
      updated_at: now,
    })
    .eq("id", activationId)
    .eq("org_id", activation.org_id)
    .eq("status", "activating");
  if (error) {
    throw new NonRetriableError(error.message);
  }
  return adset.adsetId;
}

/** Sube asset, creativo y anuncio; persiste meta_ad_id. Idempotente si ya hay anuncio. */
export async function ensureMetaAdStep(activationId: string): Promise<string> {
  const ctx = await loadCampaignCreateContext(activationId);
  const { activation, template, assets, meta, accessToken } = ctx;
  if (activation.meta_ad_id) {
    return activation.meta_ad_id;
  }
  if (!activation.meta_adset_id) {
    throw new NonRetriableError(
      "Falta meta_adset_id; ejecuta primero el paso de conjunto.",
    );
  }
  const adAccountId = normalizeAdAccountId(meta.ad_account_id);
  const baseName = buildBaseName(template.name, activationId);
  const asset = pickPrimaryAsset(assets);

  let creativeId: string;

  if (asset.file_type === "video") {
    const vid = await uploadAdVideoFromUrl(
      accessToken,
      adAccountId,
      asset.file_url,
    );
    const cr = await createVideoAdCreative(accessToken, adAccountId, {
      name: `${baseName} (creativo)`,
      pageId: meta.page_id,
      instagramActorId: meta.ig_account_id,
      link: activation.landing_url,
      message: template.copy_base,
      videoId: vid.videoId,
    });
    creativeId = cr.creativeId;
  } else {
    const img = await uploadAdImageFromUrl(
      accessToken,
      adAccountId,
      asset.file_url,
    );
    const cr = await createLinkAdCreative(accessToken, adAccountId, {
      name: `${baseName} (creativo)`,
      pageId: meta.page_id,
      instagramActorId: meta.ig_account_id,
      link: activation.landing_url,
      message: template.copy_base,
      imageHash: img.hash,
    });
    creativeId = cr.creativeId;
  }

  const ad = await createAdPaused(accessToken, adAccountId, {
    name: `${baseName} (anuncio)`,
    adsetId: activation.meta_adset_id,
    creativeId,
  });

  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();
  const { error } = await admin
    .from("campaign_activations")
    .update({
      meta_ad_id: ad.adId,
      updated_at: now,
    })
    .eq("id", activationId)
    .eq("org_id", activation.org_id)
    .eq("status", "activating");
  if (error) {
    throw new NonRetriableError(error.message);
  }
  return ad.adId;
}

/** Activa la campaña en Meta y marca la activación como `active`. */
export async function finalizeActivationStep(activationId: string): Promise<void> {
  const ctx = await loadCampaignCreateContext(activationId);
  const { activation, accessToken } = ctx;
  if (activation.status === "active") {
    return;
  }
  if (!activation.meta_campaign_id || !activation.meta_ad_id) {
    throw new NonRetriableError(
      "Faltan IDs de Meta necesarios para activar la campaña.",
    );
  }
  await updateCampaignStatus(accessToken, activation.meta_campaign_id, "ACTIVE");

  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();
  const { error: uErr } = await admin
    .from("campaign_activations")
    .update({
      status: "active",
      activated_at: now,
      meta_error: null,
      updated_at: now,
    })
    .eq("id", activationId)
    .eq("org_id", activation.org_id)
    .eq("status", "activating");

  if (uErr) {
    throw new NonRetriableError(uErr.message);
  }

  await admin.from("activity_log").insert({
    org_id: activation.org_id,
    user_id: null,
    entity_type: "campaign_activation",
    entity_id: activationId,
    action: "meta.activation_activated",
    metadata: {
      meta_campaign_id: activation.meta_campaign_id,
      meta_adset_id: activation.meta_adset_id,
      meta_ad_id: activation.meta_ad_id,
    },
  });
}

export function metaErrorPayload(err: unknown): Json {
  if (err instanceof NonRetriableError) {
    return {
      type: "non_retriable",
      message: err.message,
    };
  }
  if (isMetaApiError(err)) {
    return {
      type: "meta_api",
      code: err.code,
      subcode: err.subcode,
      message: err.message,
      retryable: err.isRetryable,
    };
  }
  const e = err as { message?: string };
  return {
    type: "error",
    message: e?.message ?? String(err),
  };
}

/** Solo errores definitivos: no marcar `failed` si el fallo es retryable de Meta. */
export function shouldPersistActivationFailure(err: unknown): boolean {
  if (err instanceof NonRetriableError) return true;
  if (isMetaApiError(err) && !err.isRetryable) return true;
  return false;
}

export async function persistActivationFailure(
  activationId: string,
  err: unknown,
): Promise<void> {
  const admin = getSupabaseAdmin();
  const { data: row } = await admin
    .from("campaign_activations")
    .select("org_id, status")
    .eq("id", activationId)
    .maybeSingle();
  if (!row || row.status !== "activating") return;

  const payload = metaErrorPayload(err);
  const now = new Date().toISOString();
  await admin
    .from("campaign_activations")
    .update({
      status: "failed",
      meta_error: payload,
      updated_at: now,
    })
    .eq("id", activationId)
    .eq("org_id", row.org_id)
    .eq("status", "activating");

  await admin.from("activity_log").insert({
    org_id: row.org_id,
    user_id: null,
    entity_type: "campaign_activation",
    entity_id: activationId,
    action: "meta.activation_failed",
    metadata: { meta_error: payload },
  });
}
