import { useRef, useState } from "react";
import { data, Form, Link, redirect, useNavigation } from "react-router";
import { ZodError } from "zod";
import { z } from "zod";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Label } from "~/components/ui/label";
import { requireLeader } from "~/lib/auth.server";
import { actionError, formatZodFieldErrors } from "~/lib/errors";
import { activationStatusBadgeVariant } from "~/lib/activations";
import {
  notifyAffiliateProcessing,
  notifyAffiliateRejected,
} from "~/lib/notifications.server";
import { getSupabaseAdmin } from "~/lib/supabase.admin.server";
import type { Route } from "./+types/_leader.activations.$id";

const actionSchema = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("approve") }),
  z.object({ intent: z.literal("retry_dispatch") }),
  z.object({
    intent: z.literal("reject"),
    reason: z.string().min(5, "La razón debe tener al menos 5 caracteres"),
  }),
]);

function isPdfUrl(url: string) {
  try {
    const p = new URL(url).pathname.toLowerCase();
    return p.endsWith(".pdf");
  } catch {
    return url.toLowerCase().includes(".pdf");
  }
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { supabase, user, headers } = await requireLeader(request);
  const id = params.id;
  if (!id) {
    throw new Response("Not found", { status: 404, headers });
  }

  const { data: activation, error: aErr } = await supabase
    .from("campaign_activations")
    .select("*")
    .eq("id", id)
    .eq("org_id", user.orgId)
    .maybeSingle();

  if (aErr) {
    throw new Response(aErr.message, { status: 500, headers });
  }
  if (!activation) {
    throw new Response("No encontrado", { status: 404, headers });
  }

  const [
    { data: affiliate },
    { data: template },
    { data: geo },
    { data: payment },
    { data: createJob },
  ] = await Promise.all([
    supabase
      .from("users")
      .select("id, full_name, email, subdomain")
      .eq("id", activation.affiliate_id)
      .single(),
    supabase
      .from("campaign_templates")
      .select("name, copy_base, min_budget, max_budget")
      .eq("id", activation.template_id)
      .single(),
    supabase
      .from("allowed_geos")
      .select("label, country_code")
      .eq("id", activation.selected_geo_id)
      .single(),
    supabase
      .from("payments")
      .select("*")
      .eq("activation_id", activation.id)
      .maybeSingle(),
    supabase
      .from("campaign_create_jobs")
      .select(
        "status, attempt_count, dispatch_count, last_dispatched_at, last_error, current_step",
      )
      .eq("activation_id", activation.id)
      .maybeSingle(),
  ]);

  return data(
    {
      activation,
      affiliate: affiliate ?? null,
      templateName: template?.name ?? "—",
      templateCopy: template?.copy_base ?? "",
      geoLabel: geo?.label ?? "—",
      geoCountry: geo?.country_code ?? "",
      payment: payment ?? null,
      createJob: createJob ?? null,
    },
    { headers },
  );
}

export async function action({ request, params }: Route.ActionArgs) {
  const { user, headers } = await requireLeader(request);
  const admin = getSupabaseAdmin();
  const id = params.id;
  if (!id) {
    return data(actionError("Solicitud inválida"), { headers, status: 400 });
  }

  const formData = await request.formData();
  const raw = Object.fromEntries(formData);

  try {
    const parsed = actionSchema.parse(raw);
    const { dispatchCampaignCreateJob, insertPendingJob } = await import(
      "~/lib/campaign-create.server"
    );

    const { data: activation, error: loadErr } = await admin
      .from("campaign_activations")
      .select("id, org_id, status, affiliate_id, template_id")
      .eq("id", id)
      .eq("org_id", user.orgId)
      .maybeSingle();

    if (loadErr || !activation) {
      return data(actionError("Solicitud no encontrada"), { headers, status: 404 });
    }

    if (parsed.intent === "approve") {
      if (activation.status !== "pending_approval") {
        return data(
          actionError("Esta solicitud ya no está pendiente de aprobación."),
          { headers, status: 409 },
        );
      }

      const now = new Date().toISOString();

      const { data: updatedAct, error: u1 } = await admin
        .from("campaign_activations")
        .update({ status: "queued", updated_at: now })
        .eq("id", id)
        .eq("org_id", user.orgId)
        .eq("status", "pending_approval")
        .select("id")
        .maybeSingle();

      if (u1 || !updatedAct) {
        return data(
          actionError(
            "No se pudo aprobar: otro proceso pudo haberla actualizado. Recarga.",
          ),
          { headers, status: 409 },
        );
      }

      const { data: updatedPay, error: u2 } = await admin
        .from("payments")
        .update({
          status: "approved",
          reviewed_at: now,
          reviewed_by: user.id,
          updated_at: now,
        })
        .eq("activation_id", id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();

      if (u2 || !updatedPay) {
        await admin
          .from("campaign_activations")
          .update({ status: "pending_approval", updated_at: now })
          .eq("id", id)
          .eq("org_id", user.orgId);
        return data(
          actionError("No se pudo marcar el pago como aprobado."),
          { headers, status: 400 },
        );
      }

      try {
        await insertPendingJob(admin, user.orgId, id);
      } catch (jobErr) {
        await admin
          .from("campaign_activations")
          .update({ status: "pending_approval", updated_at: now })
          .eq("id", id)
          .eq("org_id", user.orgId);
        await admin
          .from("payments")
          .update({
            status: "pending",
            reviewed_at: null,
            reviewed_by: null,
            updated_at: now,
          })
          .eq("activation_id", id);
        return data(
          actionError(
            jobErr instanceof Error
              ? jobErr.message
              : "No se pudo crear el job de publicación.",
          ),
          { headers, status: 500 },
        );
      }

      const dispatch = await dispatchCampaignCreateJob(id);

      await admin.from("activity_log").insert({
        org_id: user.orgId,
        user_id: user.id,
        entity_type: "campaign_activation",
        entity_id: id,
        action: "activation.job_queued",
        metadata: {
          inngest_sent: dispatch.sent,
          inngest_error: dispatch.error ?? null,
        },
      });

      await admin.from("activity_log").insert({
        org_id: user.orgId,
        user_id: user.id,
        entity_type: "campaign_activation",
        entity_id: id,
        action: "activation.approved",
        metadata: {
          inngest_sent: dispatch.sent,
          inngest_error: dispatch.error ?? null,
        },
      });

      const { data: tplApprove } = await admin
        .from("campaign_templates")
        .select("name")
        .eq("id", activation.template_id)
        .maybeSingle();
      await notifyAffiliateProcessing(admin, {
        affiliateId: activation.affiliate_id,
        orgId: user.orgId,
        activationId: id,
        templateName: tplApprove?.name ?? "Campaña",
      });

      if (!dispatch.sent) {
        console.warn(
          "[activation] Aprobada pero Inngest no envió el evento:",
          dispatch.error,
        );
      }

      throw redirect("/leader/activations");
    }

    if (parsed.intent === "retry_dispatch") {
      if (activation.status !== "queued" && activation.status !== "activating") {
        return data(
          actionError(
            "Solo se puede reintentar si está en cola o activándose en Meta.",
          ),
          { headers, status: 409 },
        );
      }

      const { data: pay } = await admin
        .from("payments")
        .select("status")
        .eq("activation_id", id)
        .maybeSingle();
      if (pay?.status !== "approved") {
        return data(actionError("El pago no está aprobado."), {
          headers,
          status: 400,
        });
      }

      const { data: jobRow } = await admin
        .from("campaign_create_jobs")
        .select("id, status")
        .eq("activation_id", id)
        .maybeSingle();

      if (!jobRow) {
        await insertPendingJob(admin, user.orgId, id);
      } else if (jobRow.status === "failed") {
        await admin
          .from("campaign_create_jobs")
          .update({ status: "pending", last_error: null })
          .eq("id", jobRow.id);
      }

      const dispatch = await dispatchCampaignCreateJob(id);
      await admin.from("activity_log").insert({
        org_id: user.orgId,
        user_id: user.id,
        entity_type: "campaign_activation",
        entity_id: id,
        action: "activation.job_requeued",
        metadata: {
          inngest_sent: dispatch.sent,
          inngest_error: dispatch.error ?? null,
        },
      });

      throw redirect("/leader/activations");
    }

    const reason = parsed.reason.trim();

    if (activation.status !== "pending_approval") {
      return data(
        actionError("Esta solicitud ya no está pendiente de aprobación."),
        { headers, status: 409 },
      );
    }

    const now = new Date().toISOString();

    const { data: updatedAct, error: r1 } = await admin
      .from("campaign_activations")
      .update({
        status: "rejected",
        rejection_reason: reason,
        updated_at: now,
      })
      .eq("id", id)
      .eq("org_id", user.orgId)
      .eq("status", "pending_approval")
      .select("id")
      .maybeSingle();

    if (r1 || !updatedAct) {
      return data(
        actionError(
          "No se pudo rechazar: otro proceso pudo haberla actualizado. Recarga.",
        ),
        { headers, status: 409 },
      );
    }

    const { data: updatedPay, error: r2 } = await admin
      .from("payments")
      .update({
        status: "rejected",
        rejection_reason: reason,
        reviewed_at: now,
        reviewed_by: user.id,
        updated_at: now,
      })
      .eq("activation_id", id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (r2 || !updatedPay) {
      await admin
        .from("campaign_activations")
        .update({
          status: "pending_approval",
          rejection_reason: null,
          updated_at: now,
        })
        .eq("id", id)
        .eq("org_id", user.orgId);
      return data(actionError("No se pudo actualizar el pago."), {
        headers,
        status: 400,
      });
    }

    await admin.from("activity_log").insert({
      org_id: user.orgId,
      user_id: user.id,
      entity_type: "campaign_activation",
      entity_id: id,
      action: "activation.rejected",
      metadata: {},
    });

    const { data: tplReject } = await admin
      .from("campaign_templates")
      .select("name")
      .eq("id", activation.template_id)
      .maybeSingle();
    await notifyAffiliateRejected(admin, {
      affiliateId: activation.affiliate_id,
      orgId: user.orgId,
      activationId: id,
      templateName: tplReject?.name ?? "Campaña",
      reason,
    });

    throw redirect("/leader/activations");
  } catch (error) {
    if (error instanceof ZodError) {
      return data(
        actionError("Revisa el formulario", formatZodFieldErrors(error)),
        { headers },
      );
    }
    if (error instanceof Response) {
      throw error;
    }
    if (error instanceof Error) {
      return data(actionError(error.message), { headers, status: 400 });
    }
    throw error;
  }
}

export default function LeaderActivationDetail({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const {
    activation,
    affiliate,
    templateName,
    templateCopy,
    geoLabel,
    geoCountry,
    payment,
    createJob,
  } = loaderData;

  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";
  const canReview = activation.status === "pending_approval";
  const canRetryDispatch =
    (activation.status === "queued" || activation.status === "activating") &&
    payment?.status === "approved";

  const approveDialogRef = useRef<HTMLDialogElement>(null);
  const [rejectReason, setRejectReason] = useState("");

  const proofUrl = payment?.proof_url ?? "";
  const proofIsPdf = proofUrl ? isPdfUrl(proofUrl) : false;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{templateName}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {affiliate
              ? `${affiliate.full_name?.trim() || affiliate.email} · ${affiliate.email}`
              : "—"}
          </p>
        </div>
        <Badge variant={activationStatusBadgeVariant(activation.status)}>
          {activation.status}
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Solicitud</CardTitle>
            <CardDescription>Datos enviados por el afiliado.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">Presupuesto: </span>
              {activation.budget}
            </p>
            <p>
              <span className="text-muted-foreground">Ubicación: </span>
              {geoLabel} ({geoCountry})
            </p>
            <p>
              <span className="text-muted-foreground">Landing: </span>
              <a
                className="text-primary break-all underline"
                href={activation.landing_url}
                target="_blank"
                rel="noreferrer"
              >
                {activation.landing_url}
              </a>
            </p>
            <p className="text-muted-foreground text-xs">
              Creada: {new Date(activation.created_at).toLocaleString("es-MX")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pago</CardTitle>
            <CardDescription>Comprobante y monto declarado.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {payment ? (
              <>
                <p>
                  <span className="text-muted-foreground">Monto: </span>
                  {payment.amount}
                </p>
                <p>
                  <span className="text-muted-foreground">Estado pago: </span>
                  {payment.status}
                </p>
                <p>
                  <a
                    className="text-primary font-medium underline"
                    href={payment.proof_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Abrir comprobante en nueva pestaña
                  </a>
                </p>
              </>
            ) : (
              <p className="text-destructive text-sm">Sin registro de pago.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {payment?.proof_url ? (
        <Card>
          <CardHeader>
            <CardTitle>Vista previa del comprobante</CardTitle>
          </CardHeader>
          <CardContent>
            {proofIsPdf ? (
              <iframe
                title="Comprobante PDF"
                src={payment.proof_url}
                className="h-[480px] w-full rounded-md border"
              />
            ) : (
              <img
                src={payment.proof_url}
                alt="Comprobante"
                className="max-h-[480px] w-auto rounded-md border object-contain"
              />
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Copy de la campaña</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm whitespace-pre-wrap">{templateCopy}</p>
        </CardContent>
      </Card>

      {createJob ? (
        <Card>
          <CardHeader>
            <CardTitle>Job publicación Meta</CardTitle>
            <CardDescription>
              Cola durable + Inngest. Si el envío falló, reintenta abajo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>
              <span className="text-muted-foreground">Estado job: </span>
              {createJob.status}
            </p>
            <p>
              <span className="text-muted-foreground">Intentos worker: </span>
              {createJob.attempt_count} · Despachos: {createJob.dispatch_count}
            </p>
            {createJob.current_step ? (
              <p>
                <span className="text-muted-foreground">Paso: </span>
                {createJob.current_step}
              </p>
            ) : null}
            {createJob.last_dispatched_at ? (
              <p className="text-muted-foreground text-xs">
                Último dispatch:{" "}
                {new Date(createJob.last_dispatched_at).toLocaleString("es-MX")}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {canRetryDispatch ? (
        <Card>
          <CardHeader>
            <CardTitle>Reintentar envío a Meta</CardTitle>
            <CardDescription>
              Vuelve a encolar el evento <code>campaign/create</code> (Inngest)
              sin cambiar el pago.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form method="post" className="flex flex-wrap gap-3">
              <input type="hidden" name="intent" value="retry_dispatch" />
              <Button type="submit" variant="secondary" disabled={submitting}>
                {submitting ? "Enviando…" : "Reintentar publicación"}
              </Button>
            </Form>
          </CardContent>
        </Card>
      ) : null}

      {canReview ? (
        <Card>
          <CardHeader>
            <CardTitle>Decisión</CardTitle>
            <CardDescription>
              Aprueba para encolar la creación en Meta o rechaza con motivo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {actionData &&
            "error" in actionData &&
            actionData.error &&
            actionData.message ? (
              <p className="text-destructive text-sm">{actionData.message}</p>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                onClick={() => approveDialogRef.current?.showModal()}
                disabled={submitting}
              >
                Aprobar pago
              </Button>
            </div>

            <dialog
              ref={approveDialogRef}
              className="rounded-lg border bg-background p-6 shadow-lg backdrop:bg-black/50"
            >
              <p className="text-sm">
                ¿Confirmas que el comprobante y el monto son correctos? Se
                marcará la solicitud como <strong>queued</strong> (cola interna)
                y se enviará el evento a Inngest para crear la campaña en Meta.
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => approveDialogRef.current?.close()}
                >
                  Cancelar
                </Button>
                <Form
                  method="post"
                  onSubmit={() => approveDialogRef.current?.close()}
                >
                  <input type="hidden" name="intent" value="approve" />
                  <Button type="submit" disabled={submitting}>
                    {submitting ? "Procesando…" : "Confirmar aprobación"}
                  </Button>
                </Form>
              </div>
            </dialog>

            <Form method="post" className="max-w-lg space-y-3">
              <input type="hidden" name="intent" value="reject" />
              <div className="space-y-2">
                <Label htmlFor="reason">Motivo del rechazo</Label>
                <textarea
                  id="reason"
                  name="reason"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  required
                  minLength={5}
                  rows={4}
                  placeholder="Ej. El monto no coincide con el acordado."
                  className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[100px] w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                />
                {actionData &&
                "fieldErrors" in actionData &&
                actionData.fieldErrors?.reason ? (
                  <p className="text-destructive text-sm">
                    {actionData.fieldErrors.reason}
                  </p>
                ) : null}
              </div>
              <Button type="submit" variant="destructive" disabled={submitting}>
                {submitting ? "Procesando…" : "Rechazar solicitud"}
              </Button>
            </Form>
          </CardContent>
        </Card>
      ) : null}

      <Button asChild variant="outline">
        <Link to="/leader/activations">Volver al listado</Link>
      </Button>
    </div>
  );
}
