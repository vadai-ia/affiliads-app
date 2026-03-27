import { inngest } from "~/lib/inngest/client";

/**
 * Job disparado al aprobar un pago. La lógica completa de Meta (Fase 5) se implementará aquí.
 * Por ahora solo confirma recepción del evento y el `activationId`.
 */
export const campaignCreate = inngest.createFunction(
  {
    id: "campaign-create",
    name: "Crear campaña en Meta",
    triggers: [{ event: "campaign/create" }],
  },
  async ({ event, step }) => {
    const activationId = event.data.activationId as string;
    await step.run("ack", async () => ({
      activationId,
      phase: "stub",
      message:
        "Evento recibido. La creación en Meta se implementa en la Fase 5.",
    }));
    return { ok: true as const, activationId };
  },
);

export const inngestFunctions = [campaignCreate] as const;
