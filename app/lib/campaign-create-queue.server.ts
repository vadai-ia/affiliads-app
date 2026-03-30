import type { Json } from "~/types/database";
import { inngest } from "~/lib/inngest/client";
import { getSupabaseAdmin } from "~/lib/supabase.admin.server";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Despacha evento Inngest y persiste estado durable en `campaign_create_jobs`. */
export async function dispatchCampaignCreateJob(activationId: string): Promise<{
  sent: boolean;
  error?: string;
}> {
  const admin = getSupabaseAdmin();
  try {
    await inngest.send({
      name: "campaign/create",
      data: { activationId },
    });
    const now = new Date().toISOString();
    const { data: job } = await admin
      .from("campaign_create_jobs")
      .select("dispatch_count")
      .eq("activation_id", activationId)
      .maybeSingle();

    await admin
      .from("campaign_create_jobs")
      .update({
        status: "dispatched",
        last_dispatched_at: now,
        dispatch_count: (job?.dispatch_count ?? 0) + 1,
      })
      .eq("activation_id", activationId);

    console.info("[inngest] campaign/create dispatched", {
      activationId,
      at: now,
    });
    return { sent: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[inngest] campaign/create send failed:", message, {
      activationId,
    });
    await admin
      .from("campaign_create_jobs")
      .update({
        last_error: { type: "dispatch", message } as unknown as Json,
      })
      .eq("activation_id", activationId);
    return { sent: false, error: message };
  }
}

/** Código Postgres unique_violation — job ya existe (doble submit / retry). */
const PG_UNIQUE = "23505";

export async function insertPendingJob(
  admin: SupabaseClient,
  orgId: string,
  activationId: string,
): Promise<void> {
  const { error } = await admin.from("campaign_create_jobs").insert({
    org_id: orgId,
    activation_id: activationId,
    status: "pending",
  });
  if (error && error.code !== PG_UNIQUE) {
    throw new Error(error.message);
  }
}

export async function deleteJobForActivation(
  admin: SupabaseClient,
  activationId: string,
): Promise<void> {
  await admin.from("campaign_create_jobs").delete().eq("activation_id", activationId);
}

export async function markJobSucceeded(
  admin: SupabaseClient,
  activationId: string,
): Promise<void> {
  await admin
    .from("campaign_create_jobs")
    .update({
      status: "succeeded",
      last_error: null,
      locked_at: null,
      locked_by: null,
      current_step: "completed",
    })
    .eq("activation_id", activationId);
}

export async function markJobFailed(
  admin: SupabaseClient,
  activationId: string,
  payload: Json,
): Promise<void> {
  await admin
    .from("campaign_create_jobs")
    .update({
      status: "failed",
      last_error: payload,
      locked_at: null,
      locked_by: null,
    })
    .eq("activation_id", activationId);
}

export async function updateJobStep(
  admin: SupabaseClient,
  activationId: string,
  step: string,
  runId: string,
): Promise<void> {
  await admin
    .from("campaign_create_jobs")
    .update({
      current_step: step,
      locked_at: new Date().toISOString(),
      locked_by: runId,
    })
    .eq("activation_id", activationId);
}

const STALE_DISPATCH_MS = 5 * 60 * 1000;
const STALE_LOCK_MS = 45 * 60 * 1000;

/**
 * Re-despacha jobs pendientes / atascados y crea jobs faltantes para activaciones `queued`.
 */
export async function reconcileCampaignCreateJobs(): Promise<{
  dispatched: number;
  jobsCreated: number;
  staleLocksReset: number;
}> {
  const admin = getSupabaseAdmin();
  let dispatched = 0;
  let jobsCreated = 0;
  let staleLocksReset = 0;

  const now = Date.now();
  const staleDispatchBefore = new Date(now - STALE_DISPATCH_MS).toISOString();
  const staleLockBefore = new Date(now - STALE_LOCK_MS).toISOString();

  const { data: staleRunning } = await admin
    .from("campaign_create_jobs")
    .select("id, activation_id, locked_at")
    .eq("status", "running")
    .not("locked_at", "is", null)
    .lt("locked_at", staleLockBefore);

  for (const row of staleRunning ?? []) {
    await admin
      .from("campaign_create_jobs")
      .update({
        status: "dispatched",
        locked_at: null,
        locked_by: null,
        last_error: {
          type: "reconcile",
          message: "Lock stale; re-dispatch",
        } as unknown as Json,
        current_step: "reconcile_stale_lock",
      })
      .eq("id", row.id);
    const r = await dispatchCampaignCreateJob(row.activation_id);
    if (r.sent) {
      staleLocksReset += 1;
      dispatched += 1;
    }
  }

  const { data: queuedActs } = await admin
    .from("campaign_activations")
    .select("id, org_id")
    .eq("status", "queued");

  for (const act of queuedActs ?? []) {
    const { data: existing } = await admin
      .from("campaign_create_jobs")
      .select("id")
      .eq("activation_id", act.id)
      .maybeSingle();
    if (!existing) {
      await admin.from("campaign_create_jobs").insert({
        org_id: act.org_id,
        activation_id: act.id,
        status: "pending",
      });
      jobsCreated += 1;
    }
  }

  const { data: jobs } = await admin
    .from("campaign_create_jobs")
    .select("activation_id, status, last_dispatched_at")
    .in("status", ["pending", "dispatched"]);

  for (const j of jobs ?? []) {
    const { data: act } = await admin
      .from("campaign_activations")
      .select("status, meta_campaign_id")
      .eq("id", j.activation_id)
      .maybeSingle();

    if (
      !act ||
      act.status === "active" ||
      act.status === "failed" ||
      act.status === "rejected" ||
      act.status === "pending_approval" ||
      act.status === "pending_payment"
    ) {
      continue;
    }

    if (j.status === "pending") {
      const r = await dispatchCampaignCreateJob(j.activation_id);
      if (r.sent) dispatched += 1;
      continue;
    }

    if (j.status === "dispatched") {
      const last = j.last_dispatched_at ? new Date(j.last_dispatched_at).getTime() : 0;
      if (!j.last_dispatched_at || last < new Date(staleDispatchBefore).getTime()) {
        const r = await dispatchCampaignCreateJob(j.activation_id);
        if (r.sent) dispatched += 1;
      }
    }
  }

  console.info("[campaign-create-reconcile]", {
    dispatched,
    jobsCreated,
    staleLocksReset,
  });

  return { dispatched, jobsCreated, staleLocksReset };
}
