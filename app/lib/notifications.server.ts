import * as Sentry from "@sentry/react-router";
import { createElement, type ReactElement } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import ActivationApprovedEmail from "~/emails/activation-approved";
import ActivationCompletedEmail from "~/emails/activation-completed";
import ActivationFailedEmail from "~/emails/activation-failed";
import ActivationRejectedEmail from "~/emails/activation-rejected";
import NewActivationRequestEmail from "~/emails/new-activation-request";
import { sendTransactionalEmail } from "~/lib/email.server";
import { getSiteUrl } from "~/lib/env.server";
import type { Json } from "~/types/database";
import type { Database } from "~/types/database";

export const NotificationType = {
  ActivationRequested: "activation.requested",
  ActivationProcessing: "activation.processing",
  ActivationApproved: "activation.approved",
  ActivationRejected: "activation.rejected",
  ActivationCompleted: "activation.completed",
  ActivationFailed: "activation.failed",
} as const;

type Admin = SupabaseClient<Database>;

export async function notifyUser(
  admin: Admin,
  params: {
    userId: string;
    orgId: string;
    type: string;
    title: string;
    body: string | null;
    entityType?: string | null;
    entityId?: string | null;
    email?: { to: string; subject: string; react: ReactElement } | null;
  },
): Promise<void> {
  const { error: insErr } = await admin.from("notifications").insert({
    user_id: params.userId,
    org_id: params.orgId,
    type: params.type,
    title: params.title,
    body: params.body,
    read: false,
    entity_type: params.entityType ?? null,
    entity_id: params.entityId ?? null,
  });
  if (insErr) {
    console.error("[notify] insert", insErr.message);
    Sentry.captureException(insErr, { extra: { type: params.type, userId: params.userId } });
    return;
  }

  if (!params.email) return;

  try {
    await sendTransactionalEmail(params.email);
  } catch (e) {
    Sentry.captureException(e, {
      extra: {
        notifyType: params.type,
        userId: params.userId,
        emailTo: params.email.to,
      },
    });
  }
}

export async function notifyLeadersNewActivationRequest(admin: Admin, params: {
  orgId: string;
  activationId: string;
  templateName: string;
  affiliateName: string;
}): Promise<void> {
  const { data: leaders } = await admin
    .from("users")
    .select("id, email, full_name")
    .eq("org_id", params.orgId)
    .eq("role", "leader");
  if (!leaders?.length) return;

  const site = getSiteUrl().replace(/\/$/, "");
  const activationUrl = `${site}/leader/activations/${params.activationId}`;

  for (const leader of leaders) {
    if (!leader.email) continue;
    try {
      await notifyUser(admin, {
        userId: leader.id,
        orgId: params.orgId,
        type: NotificationType.ActivationRequested,
        title: "Nueva solicitud de activación",
        body: `${params.affiliateName} envió una solicitud para «${params.templateName}».`,
        entityType: "campaign_activation",
        entityId: params.activationId,
        email: {
          to: leader.email,
          subject: `Nueva solicitud: ${params.templateName}`,
          react: createElement(NewActivationRequestEmail, {
            leaderName: leader.full_name?.trim() || leader.email,
            templateName: params.templateName,
            affiliateName: params.affiliateName,
            activationUrl,
          }),
        },
      });
    } catch (e) {
      Sentry.captureException(e, { extra: { step: "notifyLeadersNewActivationRequest" } });
    }
  }
}

export async function notifyAffiliateProcessing(admin: Admin, params: {
  affiliateId: string;
  orgId: string;
  activationId: string;
  templateName: string;
}): Promise<void> {
  const { data: aff } = await admin
    .from("users")
    .select("id")
    .eq("id", params.affiliateId)
    .maybeSingle();
  if (!aff) return;

  try {
    await notifyUser(admin, {
      userId: aff.id,
      orgId: params.orgId,
      type: NotificationType.ActivationProcessing,
      title: "Pago aprobado",
      body: `Tu solicitud para «${params.templateName}» fue aprobada. Estamos creando la campaña en Meta…`,
      entityType: "campaign_activation",
      entityId: params.activationId,
      email: null,
    });
  } catch (e) {
    Sentry.captureException(e, { extra: { step: "notifyAffiliateProcessing" } });
  }
}

export async function notifyAffiliateRejected(admin: Admin, params: {
  affiliateId: string;
  orgId: string;
  activationId: string;
  templateName: string;
  reason: string;
}): Promise<void> {
  const { data: aff } = await admin
    .from("users")
    .select("id, email, full_name")
    .eq("id", params.affiliateId)
    .maybeSingle();
  if (!aff?.email) return;

  const site = getSiteUrl().replace(/\/$/, "");
  const campaignUrl = `${site}/affiliate/activations/${params.activationId}`;

  try {
    await notifyUser(admin, {
      userId: aff.id,
      orgId: params.orgId,
      type: NotificationType.ActivationRejected,
      title: "Solicitud no aprobada",
      body: `Motivo: ${params.reason}`,
      entityType: "campaign_activation",
      entityId: params.activationId,
      email: {
        to: aff.email,
        subject: `Solicitud no aprobada: ${params.templateName}`,
        react: createElement(ActivationRejectedEmail, {
          affiliateName: aff.full_name?.trim() || aff.email,
          templateName: params.templateName,
          reason: params.reason,
          campaignUrl,
        }),
      },
    });
  } catch (e) {
    Sentry.captureException(e, { extra: { step: "notifyAffiliateRejected" } });
  }
}

export async function notifyAffiliateCampaignLive(
  admin: Admin,
  params: {
    affiliateId: string;
    orgId: string;
    activationId: string;
    templateName: string;
  },
): Promise<void> {
  const { data: aff } = await admin
    .from("users")
    .select("id, email, full_name")
    .eq("id", params.affiliateId)
    .maybeSingle();
  if (!aff?.email) return;

  const site = getSiteUrl().replace(/\/$/, "");
  const campaignUrl = `${site}/affiliate/activations/${params.activationId}`;

  try {
    await notifyUser(admin, {
      userId: aff.id,
      orgId: params.orgId,
      type: NotificationType.ActivationApproved,
      title: "Tu campaña está activa en Meta",
      body: `La campaña «${params.templateName}» ya está publicada.`,
      entityType: "campaign_activation",
      entityId: params.activationId,
      email: {
        to: aff.email,
        subject: `Activa: ${params.templateName}`,
        react: createElement(ActivationApprovedEmail, {
          affiliateName: aff.full_name?.trim() || aff.email,
          templateName: params.templateName,
          campaignUrl,
        }),
      },
    });
  } catch (e) {
    Sentry.captureException(e, { extra: { step: "notifyAffiliateCampaignLive" } });
  }
}

export async function notifyLeadersActivationFailed(admin: Admin, params: {
  orgId: string;
  activationId: string;
  templateName: string;
  errorSummary: string;
}): Promise<void> {
  const { data: leaders } = await admin
    .from("users")
    .select("id, email, full_name")
    .eq("org_id", params.orgId)
    .eq("role", "leader");
  if (!leaders?.length) return;

  const site = getSiteUrl().replace(/\/$/, "");
  const activationUrl = `${site}/leader/activations/${params.activationId}`;

  for (const leader of leaders) {
    if (!leader.email) continue;
    try {
      await notifyUser(admin, {
        userId: leader.id,
        orgId: params.orgId,
        type: NotificationType.ActivationFailed,
        title: "Error al crear campaña en Meta",
        body: params.errorSummary.slice(0, 500),
        entityType: "campaign_activation",
        entityId: params.activationId,
        email: {
          to: leader.email,
          subject: `Error Meta: ${params.templateName}`,
          react: createElement(ActivationFailedEmail, {
            leaderName: leader.full_name?.trim() || leader.email,
            templateName: params.templateName,
            errorSummary: params.errorSummary,
            activationUrl,
          }),
        },
      });
    } catch (e) {
      Sentry.captureException(e, { extra: { step: "notifyLeadersActivationFailed" } });
    }
  }
}

export async function notifyAffiliateBudgetCompleted(admin: Admin, params: {
  affiliateId: string;
  orgId: string;
  activationId: string;
  templateName: string;
  budgetLabel: string;
  spendLabel: string;
}): Promise<void> {
  const { data: aff } = await admin
    .from("users")
    .select("id, email, full_name")
    .eq("id", params.affiliateId)
    .maybeSingle();
  if (!aff?.email) return;

  const site = getSiteUrl().replace(/\/$/, "");
  const campaignUrl = `${site}/affiliate/activations/${params.activationId}`;

  try {
    await notifyUser(admin, {
      userId: aff.id,
      orgId: params.orgId,
      type: NotificationType.ActivationCompleted,
      title: "Campaña completada por presupuesto",
      body: `Tu campaña «${params.templateName}» alcanzó el umbral de presupuesto acordado.`,
      entityType: "campaign_activation",
      entityId: params.activationId,
      email: {
        to: aff.email,
        subject: `Completada: ${params.templateName}`,
        react: createElement(ActivationCompletedEmail, {
          affiliateName: aff.full_name?.trim() || aff.email,
          templateName: params.templateName,
          budgetLabel: params.budgetLabel,
          spendLabel: params.spendLabel,
          campaignUrl,
        }),
      },
    });
  } catch (e) {
    Sentry.captureException(e, { extra: { step: "notifyAffiliateBudgetCompleted" } });
  }
}

export function formatMetaErrorForEmail(metaError: Json): string {
  if (metaError === null || typeof metaError !== "object") {
    return "Error desconocido al crear la campaña en Meta.";
  }
  const o = metaError as Record<string, unknown>;
  if (typeof o.message === "string") return o.message.slice(0, 900);
  if (o.type === "meta_api") {
    const code = o.code != null ? String(o.code) : "";
    const msg = typeof o.message === "string" ? o.message : "";
    return `${code ? `Código ${code}: ` : ""}${msg}`.slice(0, 900);
  }
  try {
    return JSON.stringify(metaError).slice(0, 900);
  } catch {
    return "Error al crear la campaña en Meta.";
  }
}
