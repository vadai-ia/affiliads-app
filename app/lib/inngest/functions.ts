import { cron, NonRetriableError } from "inngest";
import {
  ensureMetaAdsetStep,
  ensureMetaAdStep,
  ensureMetaCampaignStep,
  finalizeActivationStep,
  loadCampaignCreateContext,
  persistActivationFailure,
  shouldPersistActivationFailure,
} from "~/lib/campaign-create.job.server";
import { inngest } from "~/lib/inngest/client";
import {
  runMetricsSyncJob,
  warnStuckActivating,
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

    const gate = await step.run("gate", async () => {
      const ctx = await loadCampaignCreateContext(activationId);
      if (ctx.activation.status === "active") {
        return { skip: true as const };
      }
      if (ctx.activation.status !== "activating") {
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
      await step.run("meta-campaign", () =>
        ensureMetaCampaignStep(activationId),
      );
      await step.run("meta-adset", () => ensureMetaAdsetStep(activationId));
      await step.run("meta-ad", () => ensureMetaAdStep(activationId));
      await step.run("meta-activate", () => finalizeActivationStep(activationId));
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
    return result;
  },
);

export const inngestFunctions = [campaignCreate, metricsSync] as const;
