import { inngest } from "~/lib/inngest/client";

/**
 * Encola el job de creación de campaña tras aprobar el pago.
 * Si falta `INNGEST_EVENT_KEY`, `send` puede fallar: en ese caso se registra y no se rompe la transición en DB
 * (el líder ya dejó la activación en `activating`).
 */
export async function dispatchCampaignCreateJob(activationId: string): Promise<{
  sent: boolean;
  error?: string;
}> {
  try {
    await inngest.send({
      name: "campaign/create",
      data: { activationId },
    });
    return { sent: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[inngest] campaign/create send failed:", message);
    return { sent: false, error: message };
  }
}
