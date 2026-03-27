import { getMetaGraphApiVersion } from "~/lib/env.server";
import { toMetaApiError } from "~/lib/meta/client";
import { normalizeAdAccountId } from "~/lib/meta/campaigns.server";

const GRAPH_BASE = "https://graph.facebook.com";

const LEAD_ACTION_TYPES = new Set([
  "lead",
  "onsite_conversion.lead_grouped",
  "offsite_conversion.fb_pixel_lead",
  "offsite_conversion.lead",
]);

export type CampaignInsightRow = {
  campaign_id: string;
  spend: string;
  impressions: string;
  clicks: string;
  actions?: Array<{ action_type: string; value: string }>;
};

export type GraphGetWithHeadersResult<T> = {
  data: T;
  businessUseCaseUsage: string | null;
};

function graphUrl(path: string, params: Record<string, string>): string {
  const v = getMetaGraphApiVersion();
  const base = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${GRAPH_BASE}/${v}${base}`);
  for (const [k, val] of Object.entries(params)) {
    url.searchParams.set(k, val);
  }
  return url.toString();
}

/**
 * GET Graph con logging opcional del header de uso de negocio (rate limits).
 */
export async function graphGetWithHeaders<T>(
  path: string,
  accessToken: string,
  extraParams: Record<string, string> = {},
): Promise<GraphGetWithHeadersResult<T>> {
  const url = graphUrl(path, { access_token: accessToken, ...extraParams });
  const res = await fetch(url, { method: "GET" });
  const businessUseCaseUsage = res.headers.get("x-business-use-case-usage");
  if (businessUseCaseUsage && process.env.NODE_ENV === "production") {
    // Evita spam en dev; en prod ayuda a ajustar throttling
    console.info("[meta insights] x-business-use-case-usage:", businessUseCaseUsage);
  }
  const json = (await res.json()) as T & {
    error?: { code?: number; message?: string; error_subcode?: number };
  };
  if (!res.ok || json?.error) {
    throw toMetaApiError(json);
  }
  return { data: json, businessUseCaseUsage };
}

/** Throttle simple: si el header sugiere uso alto, esperar antes del siguiente batch. */
export async function throttleIfNeeded(
  businessUseCaseUsage: string | null,
): Promise<void> {
  if (!businessUseCaseUsage) return;
  try {
    const parsed = JSON.parse(businessUseCaseUsage) as Record<
      string,
      Record<string, { call_count?: number; total_cputime?: number }>
    >;
    for (const biz of Object.values(parsed)) {
      for (const usage of Object.values(biz)) {
        const cpu = usage?.total_cputime ?? 0;
        if (cpu > 80) {
          await new Promise((r) => setTimeout(r, 2000));
          return;
        }
      }
    }
  } catch {
    // header no JSON o formato distinto
  }
}

function parseLeadsFromActions(
  actions: Array<{ action_type: string; value: string }> | undefined,
): number {
  if (!actions?.length) return 0;
  let sum = 0;
  for (const a of actions) {
    if (LEAD_ACTION_TYPES.has(a.action_type)) {
      const n = Number.parseFloat(a.value);
      if (Number.isFinite(n)) sum += n;
    }
  }
  return Math.round(sum);
}

export function computeCpl(spend: number, leads: number): string {
  if (leads <= 0 || !Number.isFinite(spend)) return "0";
  return (spend / leads).toFixed(4);
}

export function parseInsightRow(row: CampaignInsightRow): {
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  cpl: string;
} {
  const spend = Number.parseFloat(row.spend ?? "0") || 0;
  const impressions = Number.parseInt(row.impressions ?? "0", 10) || 0;
  const clicks = Number.parseInt(row.clicks ?? "0", 10) || 0;
  const leads = parseLeadsFromActions(row.actions);
  const cpl = computeCpl(spend, leads);
  return { spend, impressions, clicks, leads, cpl };
}

const MAX_CAMPAIGNS_PER_INSIGHTS_REQUEST = 45;

/**
 * Insights a nivel campaña para hoy, filtrando por IDs de campaña Meta.
 * https://developers.facebook.com/docs/marketing-api/insights
 */
export async function fetchCampaignInsightsToday(
  accessToken: string,
  adAccountId: string,
  metaCampaignIds: string[],
): Promise<{ rows: CampaignInsightRow[]; lastUsageHeader: string | null }> {
  const act = normalizeAdAccountId(adAccountId);
  const out: CampaignInsightRow[] = [];
  let lastUsage: string | null = null;

  for (let i = 0; i < metaCampaignIds.length; i += MAX_CAMPAIGNS_PER_INSIGHTS_REQUEST) {
    const chunk = metaCampaignIds.slice(i, i + MAX_CAMPAIGNS_PER_INSIGHTS_REQUEST);
    if (chunk.length === 0) continue;

    const filtering = JSON.stringify([
      { field: "campaign.id", operator: "IN", value: chunk },
    ]);

    const { data, businessUseCaseUsage } = await graphGetWithHeaders<{
      data?: CampaignInsightRow[];
    }>(`/${act}/insights`, accessToken, {
      level: "campaign",
      fields: "campaign_id,spend,impressions,clicks,actions",
      date_preset: "today",
      filtering,
    });

    lastUsage = businessUseCaseUsage;
    await throttleIfNeeded(businessUseCaseUsage);

    for (const row of data.data ?? []) {
      out.push(row);
    }
  }

  return { rows: out, lastUsageHeader: lastUsage };
}

export type CampaignStatusRow = { id: string; status?: string };

/**
 * Estados de campaña en Meta (subset).
 */
export async function fetchCampaignStatuses(
  accessToken: string,
  campaignIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const chunkSize = 50;
  for (let i = 0; i < campaignIds.length; i += chunkSize) {
    const chunk = campaignIds.slice(i, i + chunkSize);
    if (chunk.length === 0) continue;
    const ids = chunk.join(",");
    const { data } = await graphGetWithHeaders<Record<string, CampaignStatusRow>>(
      "/",
      accessToken,
      {
        ids,
        fields: "status",
      },
    );
    for (const [id, obj] of Object.entries(data)) {
      if (obj && typeof obj === "object" && "status" in obj && obj.status) {
        map.set(id, obj.status);
      }
    }
  }
  return map;
}

