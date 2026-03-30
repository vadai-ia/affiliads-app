import { getMetaGraphApiVersion } from "~/lib/env.server";
import {
  isMetaApiError,
  toMetaApiError,
  type MetaApiError,
} from "~/lib/meta/client";
import { NonRetriableError } from "inngest";

const GRAPH_BASE = "https://graph.facebook.com";

function graphUrl(path: string, params: Record<string, string>): string {
  const v = getMetaGraphApiVersion();
  const base = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${GRAPH_BASE}/${v}${base}`);
  for (const [k, val] of Object.entries(params)) {
    url.searchParams.set(k, val);
  }
  return url.toString();
}

/** Meta espera `act_123456789`. */
export function normalizeAdAccountId(raw: string): string {
  const t = raw.trim();
  if (t.startsWith("act_")) return t;
  return `act_${t.replace(/^act_/i, "")}`;
}

export function throwIfNonRetriableMeta(e: unknown): asserts e is MetaApiError {
  if (!isMetaApiError(e)) return;
  const code = e.code;
  const sub = e.subcode;
  // Creative rechazado / políticas
  if (sub === 1487851 || code === 368) {
    throw new NonRetriableError(e.message, { cause: e });
  }
  // Permisos / token / cuenta deshabilitada
  if (code === 190 || code === 200 || code === 613 || code === 10) {
    throw new NonRetriableError(e.message, { cause: e });
  }
  // Parámetro inválido (targeting, presupuesto, etc.) — no suele arreglarse con retry
  if (code === 100) {
    throw new NonRetriableError(e.message, { cause: e });
  }
}

async function graphPostForm<T>(
  path: string,
  accessToken: string,
  fields: Record<string, string | number | undefined>,
): Promise<T> {
  const url = graphUrl(path, { access_token: accessToken });
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    body.set(k, String(v));
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as T & {
    error?: { code?: number; message?: string; error_subcode?: number };
  };
  if (!res.ok || json?.error) {
    const err = toMetaApiError(json);
    throwIfNonRetriableMeta(err);
    throw err;
  }
  return json;
}

/**
 * Sube imagen desde URL pública (p. ej. Supabase Storage).
 * https://developers.facebook.com/docs/marketing-api/reference/ad-account/adimages
 */
export async function uploadAdImageFromUrl(
  accessToken: string,
  adAccountId: string,
  imageUrl: string,
): Promise<{ hash: string }> {
  const act = normalizeAdAccountId(adAccountId);
  const assetRes = await fetch(imageUrl);
  if (!assetRes.ok) {
    throw new NonRetriableError(
      `No se pudo descargar el asset para Meta (status=${assetRes.status}).`,
    );
  }
  const bytes = Buffer.from(await assetRes.arrayBuffer()).toString("base64");
  const json = await graphPostForm<{
    images?: Record<string, { hash?: string }>;
  }>(`/${act}/adimages`, accessToken, {
    bytes,
  });
  const first = json.images ? Object.values(json.images)[0] : undefined;
  const hash = first?.hash;
  if (!hash) {
    throw new NonRetriableError(
      "Meta no devolvió image hash al subir el asset.",
    );
  }
  return { hash };
}

const VIDEO_POLL_MAX = 36;
const VIDEO_POLL_MS = 5000;

/**
 * Sube vídeo y espera a que el encoding esté listo.
 */
export async function uploadAdVideoFromUrl(
  accessToken: string,
  adAccountId: string,
  videoUrl: string,
): Promise<{ videoId: string }> {
  const act = normalizeAdAccountId(adAccountId);
  const created = await graphPostForm<{ id?: string }>(
    `/${act}/advideos`,
    accessToken,
    { file_url: videoUrl },
  );
  const videoId = created.id;
  if (!videoId) {
    throw new NonRetriableError("Meta no devolvió video id al subir el vídeo.");
  }
  for (let i = 0; i < VIDEO_POLL_MAX; i++) {
    const status = await graphGetVideoStatus(accessToken, videoId);
    if (status === "ready" || status === "published") {
      return { videoId };
    }
    if (status === "error" || status === "failed") {
      throw new NonRetriableError(
        `El vídeo falló el procesamiento en Meta (status=${status}).`,
      );
    }
    await new Promise((r) => setTimeout(r, VIDEO_POLL_MS));
  }
  throw new NonRetriableError(
    "Timeout esperando que Meta procesara el vídeo (encoding).",
  );
}

async function graphGetVideoStatus(
  accessToken: string,
  videoId: string,
): Promise<string> {
  const url = graphUrl(`/${videoId}`, {
    access_token: accessToken,
    fields: "status",
  });
  const res = await fetch(url);
  const json = (await res.json()) as {
    status?: string;
    error?: { code?: number; message?: string };
  };
  if (!res.ok || json?.error) {
    throw toMetaApiError(json);
  }
  return json.status ?? "unknown";
}

export type MetaCampaignObjective =
  | "OUTCOME_TRAFFIC"
  | "OUTCOME_AWARENESS"
  | "OUTCOME_LEADS";

export async function createCampaignPaused(
  accessToken: string,
  adAccountId: string,
  params: { name: string; objective: MetaCampaignObjective },
): Promise<{ campaignId: string }> {
  const act = normalizeAdAccountId(adAccountId);
  const objective = mapTemplateObjectiveToCampaignObjective(params.objective);
  const json = await graphPostForm<{ id?: string }>(
    `/${act}/campaigns`,
    accessToken,
    {
      name: params.name.slice(0, 400),
      objective,
      status: "PAUSED",
      // Usamos presupuesto en ad set; Meta exige este flag explícito al crear la campaña.
      is_adset_budget_sharing_enabled: "false",
      special_ad_categories: JSON.stringify([]),
    },
  );
  const id = json.id;
  if (!id) throw new NonRetriableError("Meta no devolvió campaign id.");
  return { campaignId: id };
}

/** OUTCOME_LEADS sin lead form en Meta: usamos tráfico al sitio (MVP). */
function mapTemplateObjectiveToCampaignObjective(
  o: MetaCampaignObjective,
): string {
  if (o === "OUTCOME_LEADS") return "OUTCOME_TRAFFIC";
  return o;
}

export function adSetOptimizationForObjective(
  o: MetaCampaignObjective,
): string {
  if (o === "OUTCOME_AWARENESS") return "REACH";
  if (o === "OUTCOME_LEADS") return "LINK_CLICKS";
  return "LINK_CLICKS";
}

export type TargetingSpec = {
  geo_locations: { countries: string[] };
};

function buildAdSetSchedule() {
  const start = new Date(Date.now() + 5 * 60 * 1000);
  const end = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
  return {
    start_time: start.toISOString(),
    end_time: end.toISOString(),
  };
}

export async function createAdSetPaused(
  accessToken: string,
  adAccountId: string,
  params: {
    name: string;
    campaignId: string;
    objective: MetaCampaignObjective;
    lifetimeBudgetMinorUnits: number;
    targeting: TargetingSpec;
  },
): Promise<{ adsetId: string }> {
  const act = normalizeAdAccountId(adAccountId);
  const optimization_goal = adSetOptimizationForObjective(params.objective);
  const schedule = buildAdSetSchedule();
  const json = await graphPostForm<{ id?: string }>(`/${act}/adsets`, accessToken, {
    name: params.name.slice(0, 400),
    campaign_id: params.campaignId,
    billing_event: "IMPRESSIONS",
    optimization_goal,
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    lifetime_budget: params.lifetimeBudgetMinorUnits,
    start_time: schedule.start_time,
    end_time: schedule.end_time,
    targeting: JSON.stringify(params.targeting),
    status: "PAUSED",
  });
  const id = json.id;
  if (!id) throw new NonRetriableError("Meta no devolvió ad set id.");
  return { adsetId: id };
}

export async function createLinkAdCreative(
  accessToken: string,
  adAccountId: string,
  params: {
    name: string;
    pageId: string;
    instagramActorId?: string | null;
    link: string;
    message: string;
    imageHash: string;
  },
): Promise<{ creativeId: string }> {
  const act = normalizeAdAccountId(adAccountId);
  const object_story_spec: Record<string, unknown> = {
    page_id: params.pageId,
    link_data: {
      link: params.link,
      message: params.message.slice(0, 5000),
      image_hash: params.imageHash,
      call_to_action: {
        type: "LEARN_MORE",
        value: { link: params.link },
      },
    },
  };
  if (params.instagramActorId) {
    object_story_spec.instagram_actor_id = params.instagramActorId;
  }
  const json = await graphPostForm<{ id?: string }>(
    `/${act}/adcreatives`,
    accessToken,
    {
      name: params.name.slice(0, 400),
      object_story_spec: JSON.stringify(object_story_spec),
    },
  );
  const id = json.id;
  if (!id) throw new NonRetriableError("Meta no devolvió creative id.");
  return { creativeId: id };
}

export async function createVideoAdCreative(
  accessToken: string,
  adAccountId: string,
  params: {
    name: string;
    pageId: string;
    instagramActorId?: string | null;
    link: string;
    message: string;
    videoId: string;
  },
): Promise<{ creativeId: string }> {
  const act = normalizeAdAccountId(adAccountId);
  const object_story_spec: Record<string, unknown> = {
    page_id: params.pageId,
    video_data: {
      video_id: params.videoId,
      message: params.message.slice(0, 5000),
      call_to_action: {
        type: "LEARN_MORE",
        value: { link: params.link },
      },
    },
  };
  if (params.instagramActorId) {
    object_story_spec.instagram_actor_id = params.instagramActorId;
  }
  const json = await graphPostForm<{ id?: string }>(
    `/${act}/adcreatives`,
    accessToken,
    {
      name: params.name.slice(0, 400),
      object_story_spec: JSON.stringify(object_story_spec),
    },
  );
  const id = json.id;
  if (!id) throw new NonRetriableError("Meta no devolvió creative id.");
  return { creativeId: id };
}

export async function createAdPaused(
  accessToken: string,
  adAccountId: string,
  params: {
    name: string;
    adsetId: string;
    creativeId: string;
  },
): Promise<{ adId: string }> {
  const act = normalizeAdAccountId(adAccountId);
  const json = await graphPostForm<{ id?: string }>(`/${act}/ads`, accessToken, {
    name: params.name.slice(0, 400),
    adset_id: params.adsetId,
    creative: JSON.stringify({ creative_id: params.creativeId }),
    status: "PAUSED",
  });
  const id = json.id;
  if (!id) throw new NonRetriableError("Meta no devolvió ad id.");
  return { adId: id };
}

export async function updateCampaignStatus(
  accessToken: string,
  campaignId: string,
  status: "ACTIVE" | "PAUSED",
): Promise<void> {
  await graphPostForm(`/${campaignId}`, accessToken, { status });
}

export async function updateAdSetStatus(
  accessToken: string,
  adSetId: string,
  status: "ACTIVE" | "PAUSED",
): Promise<void> {
  await graphPostForm(`/${adSetId}`, accessToken, { status });
}

export async function updateAdStatus(
  accessToken: string,
  adId: string,
  status: "ACTIVE" | "PAUSED",
): Promise<void> {
  await graphPostForm(`/${adId}`, accessToken, { status });
}
