import * as Sentry from "@sentry/react-router";
import { decryptMetaAccessToken } from "~/lib/crypto.server";
import { updateCampaignStatus } from "~/lib/meta/campaigns.server";
import {
  fetchCampaignInsightsToday,
  fetchCampaignStatuses,
  parseInsightRow,
} from "~/lib/meta/insights.server";
import { getSupabaseAdmin } from "~/lib/supabase.admin.server";
import type { Database } from "~/types/database";

type ActivationRow = Database["public"]["Tables"]["campaign_activations"]["Row"];

export const BUDGET_COMPLETE_THRESHOLD = 0.95;

/** Fecha local México para alinear con `date_preset=today` de Meta (cuenta MX típica). */
export function todayDateStringMexico(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function parseBudgetMajor(budget: string): number {
  const n = Number.parseFloat(budget);
  return Number.isFinite(n) ? n : 0;
}

function groupByOrg(
  rows: ActivationRow[],
): Map<string, ActivationRow[]> {
  const m = new Map<string, ActivationRow[]>();
  for (const r of rows) {
    const list = m.get(r.org_id) ?? [];
    list.push(r);
    m.set(r.org_id, list);
  }
  return m;
}

export async function runMetricsSyncJob(): Promise<{
  orgsProcessed: number;
  activationsUpserted: number;
  completedByBudget: number;
  pausedExternal: number;
}> {
  const admin = getSupabaseAdmin();
  const todayStr = todayDateStringMexico();
  let activationsUpserted = 0;
  let completedByBudget = 0;
  let pausedExternal = 0;

  const { data: actives, error: loadErr } = await admin
    .from("campaign_activations")
    .select("*")
    .eq("status", "active")
    .not("meta_campaign_id", "is", null);

  if (loadErr) {
    console.error("[metrics.sync] load activations:", loadErr.message);
    throw loadErr;
  }

  const list = actives ?? [];
  if (list.length === 0) {
    return {
      orgsProcessed: 0,
      activationsUpserted: 0,
      completedByBudget: 0,
      pausedExternal: 0,
    };
  }

  const byOrg = groupByOrg(list);
  let orgsProcessed = 0;

  for (const [orgId, activations] of byOrg) {
    orgsProcessed += 1;
    const { data: meta, error: mErr } = await admin
      .from("meta_connections")
      .select("*")
      .eq("org_id", orgId)
      .maybeSingle();

    if (mErr || !meta) {
      console.warn("[metrics.sync] sin meta_connections para org", orgId);
      continue;
    }

    let accessToken: string;
    try {
      accessToken = decryptMetaAccessToken(meta.access_token_encrypted);
    } catch {
      console.warn("[metrics.sync] no se pudo descifrar token org", orgId);
      continue;
    }

    const adAccountId = meta.ad_account_id;
    const campaignIds = activations
      .map((a) => a.meta_campaign_id)
      .filter((id): id is string => Boolean(id));

    const uniqueCampaignIds = [...new Set(campaignIds)];

    let insightRows: Awaited<
      ReturnType<typeof fetchCampaignInsightsToday>
    >["rows"] = [];
    try {
      const fetched = await fetchCampaignInsightsToday(
        accessToken,
        adAccountId,
        uniqueCampaignIds,
      );
      insightRows = fetched.rows;
    } catch (e) {
      console.error("[metrics.sync] insights org", orgId, e);
      continue;
    }

    const byCampaignId = new Map<string, (typeof insightRows)[0]>();
    for (const row of insightRows) {
      byCampaignId.set(String(row.campaign_id), row);
    }

    const statusMap = new Map<string, string>();
    try {
      const sm = await fetchCampaignStatuses(accessToken, uniqueCampaignIds);
      for (const [k, v] of sm) {
        statusMap.set(k, v);
      }
    } catch (e) {
      console.error("[metrics.sync] campaign status org", orgId, e);
    }

    const now = new Date().toISOString();

    for (const act of activations) {
      const mid = act.meta_campaign_id;
      if (!mid) continue;

      const row = byCampaignId.get(String(mid));
      if (row) {
        const parsed = parseInsightRow(row);
        const { error: upErr } = await admin.from("campaign_metrics").upsert(
          {
            activation_id: act.id,
            date: todayStr,
            spend: parsed.spend.toFixed(2),
            impressions: parsed.impressions,
            clicks: parsed.clicks,
            leads: parsed.leads,
            cpl: parsed.cpl,
            synced_at: now,
          },
          { onConflict: "activation_id,date" },
        );
        if (upErr) {
          console.error("[metrics.sync] upsert metrics", act.id, upErr.message);
        } else {
          activationsUpserted += 1;
        }
      }

      const { data: fresh } = await admin
        .from("campaign_activations")
        .select("id, org_id, status, budget, meta_campaign_id")
        .eq("id", act.id)
        .maybeSingle();

      if (!fresh || fresh.status !== "active") continue;

      const metaStatus = statusMap.get(String(mid));
      if (metaStatus === "PAUSED" || metaStatus === "ARCHIVED") {
        const { error: pErr } = await admin
          .from("campaign_activations")
          .update({ status: "paused", updated_at: now })
          .eq("id", act.id)
          .eq("org_id", orgId)
          .eq("status", "active");
        if (!pErr) {
          pausedExternal += 1;
          await admin.from("activity_log").insert({
            org_id: orgId,
            user_id: null,
            entity_type: "campaign_activation",
            entity_id: act.id,
            action: "meta.campaign_paused_external",
            metadata: { meta_status: metaStatus },
          });
        }
        continue;
      }

      if (!row) continue;

      const parsed = parseInsightRow(row);
      const budgetMajor = parseBudgetMajor(fresh.budget);
      if (
        budgetMajor > 0 &&
        parsed.spend >= budgetMajor * BUDGET_COMPLETE_THRESHOLD
      ) {
        try {
          await updateCampaignStatus(accessToken, mid, "PAUSED");
        } catch (e) {
          console.error("[metrics.sync] pause campaign Meta", act.id, e);
          continue;
        }
        const { error: cErr } = await admin
          .from("campaign_activations")
          .update({
            status: "completed",
            completed_at: now,
            updated_at: now,
          })
          .eq("id", act.id)
          .eq("org_id", orgId)
          .eq("status", "active");
        if (!cErr) {
          completedByBudget += 1;
          await admin.from("activity_log").insert({
            org_id: orgId,
            user_id: null,
            entity_type: "campaign_activation",
            entity_id: act.id,
            action: "meta.activation_completed_budget",
            metadata: {
              spend: parsed.spend,
              budget: budgetMajor,
              threshold: BUDGET_COMPLETE_THRESHOLD,
            },
          });
        }
      }
    }
  }

  return {
    orgsProcessed,
    activationsUpserted,
    completedByBudget,
    pausedExternal,
  };
}

export async function warnStuckActivating(): Promise<void> {
  if (!process.env.SENTRY_DSN) return;

  const admin = getSupabaseAdmin();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { data: stuck, error } = await admin
    .from("campaign_activations")
    .select("id, org_id, updated_at")
    .eq("status", "activating")
    .lt("updated_at", oneHourAgo);

  if (error || !stuck?.length) return;

  for (const row of stuck) {
    Sentry.captureMessage(
      `Activación en estado activating > 1h (posible fallo Inngest): ${row.id}`,
      {
        level: "warning",
        extra: { org_id: row.org_id, updated_at: row.updated_at },
      },
    );
  }
}
