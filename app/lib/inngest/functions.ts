import { cron, NonRetriableError } from "inngest";
import {
  claimQueuedActivationForMeta,
  ensureMetaAdsetStep,
  ensureMetaAdStep,
  ensureMetaCampaignStep,
  finalizeActivationStep,
  loadCampaignCreateContext,
  persistActivationFailure,
  shouldPersistActivationFailure,
  traceMetaStep,
} from "~/lib/campaign-create.job.server";
import { reconcileCampaignCreateJobs } from "~/lib/campaign-create-queue.server";
import { inngest } from "~/lib/inngest/client";
import {
  runMetricsSyncJob,
  warnStuckActivating,
  warnStuckQueued,
} from "~/lib/metrics-sync.job.server";

type CampaignCreateEvent = {
  data: {
    activationId: string;
  };
};

export const campaignCreate = inngest.createFunction(
  {
    id: "campaign-create",
    name: "Crear campaña en Meta",
    triggers: [{ event: "campaign/create" }],
    retries: 3,
    onFailure: async ({ event, error }) => {
      const wrapped = event as {
        data?: { event?: CampaignCreateEvent };
      };
      const original = wrapped.data?.event;
      const activationId = original?.data?.activationId;
      if (!activationId) return;
      await persistActivationFailure(activationId, error);
    },
  },
  async ({ event, step }) => {
    const activationId = event.data.activationId as string;
    const runId = `${(event as { id?: string }).id ?? "evt"}-${activationId.slice(0, 8)}`;

    const gate = await step.run("gate", async () => {
      const ctx = await loadCampaignCreateContext(activationId);
      if (ctx.activation.status === "active") {
        return { skip: true as const };
      }
      const ok =
        ctx.activation.status === "queued" ||
        ctx.activation.status === "activating";
      if (!ok) {
        throw new NonRetriableError(
          `Estado de activación inválido para el job: ${ctx.activation.status}`,
        );
      }
      return { skip: false as const };
    });

    if (gate.skip) {
      return { ok: true as const, activationId, skipped: true };
    }

    try {
      await step.run("claim", () =>
        claimQueuedActivationForMeta(activationId, runId),
      );
      await step.run("meta-campaign", async () => {
        await traceMetaStep(activationId, "meta-campaign", runId);
        return ensureMetaCampaignStep(activationId);
      });
      await step.run("meta-adset", async () => {
        await traceMetaStep(activationId, "meta-adset", runId);
        return ensureMetaAdsetStep(activationId);
      });
      await step.run("meta-ad", async () => {
        await traceMetaStep(activationId, "meta-ad", runId);
        return ensureMetaAdStep(activationId);
      });
      await step.run("meta-activate", async () => {
        await traceMetaStep(activationId, "meta-activate", runId);
        return finalizeActivationStep(activationId);
      });
    } catch (e) {
      if (shouldPersistActivationFailure(e)) {
        await step.run("persist-failure", async () => {
          await persistActivationFailure(activationId, e);
        });
      }
      throw e;
    }

    return { ok: true as const, activationId };
  },
);

export const campaignCreateReconcile = inngest.createFunction(
  {
    id: "campaign-create-reconcile",
    name: "Reconciliar cola creación Meta",
    triggers: [cron("*/5 * * * *")],
    retries: 2,
  },
  async ({ step }) => {
    const result = await step.run("reconcile", () =>
      reconcileCampaignCreateJobs(),
    );
    console.info("[inngest] campaign-create-reconcile", result);
    return result;
  },
);

export const metricsSync = inngest.createFunction(
  {
    id: "metrics-sync",
    name: "Sincronizar métricas Meta",
    triggers: [cron("*/15 * * * *")],
    retries: 2,
  },
  async ({ step }) => {
    const result = await step.run("sync-metrics", () => runMetricsSyncJob());
    await step.run("warn-stuck-activating", () => warnStuckActivating());
    await step.run("warn-stuck-queued", () => warnStuckQueued());
    return result;
  },
);

export const inngestFunctions = [
  campaignCreate,
  campaignCreateReconcile,
  metricsSync,
] as const;
