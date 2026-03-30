import { data, redirect } from "react-router";
import { ZodError } from "zod";
import { ActivationWizard } from "~/components/activation-wizard";
import { requireAffiliate } from "~/lib/auth.server";
import { actionError, formatZodFieldErrors } from "~/lib/errors";
import {
  buildAffiliateLandingUrl,
  parseActivationSubmitFromFormData,
} from "~/lib/activations";
import { notifyLeadersNewActivationRequest } from "~/lib/notifications.server";
import { getSupabaseAdmin } from "~/lib/supabase.admin.server";
import { formatBudget } from "~/lib/templates";
import type { Route } from "./+types/_affiliate.activate.$id";

export async function loader({ request, params }: Route.LoaderArgs) {
  const { supabase, user, headers } = await requireAffiliate(request);
  const id = params.id;
  if (!id) {
    throw new Response("Not found", { status: 404, headers });
  }

  const [{ data: template, error: templateError }, { data: bank }, { data: org }, { data: profile }] =
    await Promise.all([
      supabase
        .from("campaign_templates")
        .select(
          "id, name, copy_base, min_budget, max_budget, campaign_objective, assets (file_url, file_type, sort_order), allowed_geos (id, label, country_code)",
        )
        .eq("id", id)
        .eq("org_id", user.orgId)
        .eq("status", "active")
        .maybeSingle(),
      supabase
        .from("bank_details")
        .select(
          "bank_name, account_holder, account_number, clabe, instructions",
        )
        .eq("org_id", user.orgId)
        .maybeSingle(),
      supabase
        .from("organizations")
        .select("base_domain")
        .eq("id", user.orgId)
        .single(),
      supabase
        .from("users")
        .select("subdomain")
        .eq("id", user.id)
        .single(),
    ]);

  if (templateError) {
    throw new Response(templateError.message, { status: 500, headers });
  }
  if (!template) {
    throw new Response("Campaña no encontrada", { status: 404, headers });
  }

  const assets = Array.isArray(template.assets) ? template.assets : [];
  const sortedAssets = [...assets].sort((a, b) => {
    const ao = a.sort_order ?? 0;
    const bo = b.sort_order ?? 0;
    return ao - bo;
  });
  const geos = Array.isArray(template.allowed_geos) ? template.allowed_geos : [];

  let landingUrl: string | null = null;
  let landingBlocked: string | null = null;
  try {
    if (org?.base_domain && profile?.subdomain) {
      landingUrl = buildAffiliateLandingUrl(org.base_domain, profile.subdomain);
    } else {
      landingBlocked =
        "Falta subdominio o dominio base de la organización. Contacta a tu líder.";
    }
  } catch (e) {
    landingBlocked =
      e instanceof Error ? e.message : "No se pudo generar la URL de landing.";
  }

  return data(
    {
      template: {
        id: template.id,
        name: template.name,
        copy_base: template.copy_base,
        min_budget: template.min_budget,
        max_budget: template.max_budget,
        campaign_objective: template.campaign_objective,
        assets: sortedAssets.map((a) => ({
          file_url: a.file_url,
          file_type: a.file_type as "image" | "video",
        })),
      },
      geos,
      bank: bank ?? null,
      landingUrl,
      landingBlocked,
    },
    { headers },
  );
}

export async function action({ request, params }: Route.ActionArgs) {
  const { supabase, user, headers } = await requireAffiliate(request);
  const admin = getSupabaseAdmin();
  const templateId = params.id;
  if (!templateId) {
    return data(actionError("Solicitud inválida"), { headers, status: 400 });
  }

  const formData = await request.formData();

  try {
    const payload = parseActivationSubmitFromFormData(formData);

    if (payload.template_id !== templateId) {
      return data(actionError("Template no coincide"), { headers, status: 400 });
    }

    const { data: template, error: tErr } = await supabase
      .from("campaign_templates")
      .select("id, org_id, status, min_budget, max_budget, name")
      .eq("id", templateId)
      .eq("org_id", user.orgId)
      .eq("status", "active")
      .maybeSingle();

    if (tErr || !template) {
      return data(actionError("Campaña no disponible"), { headers, status: 400 });
    }

    const minB = Number(template.min_budget);
    const maxB = Number(template.max_budget);
    if (
      !Number.isFinite(payload.budget) ||
      payload.budget < minB ||
      payload.budget > maxB
    ) {
      return data(
        actionError(`El monto debe estar entre ${minB} y ${maxB}.`),
        { headers, status: 400 },
      );
    }

    const { data: geoOk } = await supabase
      .from("allowed_geos")
      .select("id")
      .eq("id", payload.selected_geo_id)
      .eq("template_id", templateId)
      .maybeSingle();

    if (!geoOk) {
      return data(actionError("La ubicación elegida no es válida."), {
        headers,
        status: 400,
      });
    }

    const [{ data: org }, { data: profile }] = await Promise.all([
      supabase
        .from("organizations")
        .select("base_domain")
        .eq("id", user.orgId)
        .single(),
      supabase.from("users").select("subdomain").eq("id", user.id).single(),
    ]);

    let landingUrl: string;
    try {
      if (!org?.base_domain || !profile?.subdomain) {
        return data(
          actionError(
            "No se puede generar la landing: falta subdominio o dominio base.",
          ),
          { headers, status: 400 },
        );
      }
      landingUrl = buildAffiliateLandingUrl(org.base_domain, profile.subdomain);
    } catch (e) {
      return data(
        actionError(
          e instanceof Error ? e.message : "Landing inválida",
        ),
        { headers, status: 400 },
      );
    }

    const { data: duplicate } = await supabase
      .from("campaign_activations")
      .select("id")
      .eq("affiliate_id", user.id)
      .eq("template_id", templateId)
      .in("status", [
        "pending_payment",
        "pending_approval",
        "queued",
        "activating",
        "active",
      ])
      .maybeSingle();

    if (duplicate) {
      return data(
        actionError(
          "Ya tienes una solicitud abierta para esta campaña. Revisa «Mis activaciones».",
        ),
        { headers, status: 400 },
      );
    }

    const { data: created, error: insErr } = await supabase
      .from("campaign_activations")
      .insert({
        org_id: user.orgId,
        template_id: templateId,
        affiliate_id: user.id,
        budget: formatBudget(payload.budget),
        selected_geo_id: payload.selected_geo_id,
        landing_url: landingUrl,
        status: "pending_approval",
      })
      .select("id")
      .single();

    if (insErr || !created) {
      return data(
        actionError(insErr?.message ?? "No se pudo crear la activación"),
        { headers },
      );
    }

    const { error: payErr } = await supabase.from("payments").insert({
      activation_id: created.id,
      proof_url: payload.proof.fileUrl,
      amount: formatBudget(payload.budget),
      status: "pending",
    });

    if (payErr) {
      await admin.from("campaign_activations").delete().eq("id", created.id);
      return data(
        actionError(payErr.message ?? "No se pudo guardar el comprobante"),
        { headers },
      );
    }

    await admin.from("activity_log").insert({
      org_id: user.orgId,
      user_id: user.id,
      entity_type: "campaign_activation",
      entity_id: created.id,
      action: "activation.submitted",
      metadata: {
        template_id: templateId,
        budget: payload.budget,
      },
    });

    await notifyLeadersNewActivationRequest(admin, {
      orgId: user.orgId,
      activationId: created.id,
      templateName: template.name,
      affiliateName: user.fullName?.trim() || user.email,
    });

    throw redirect(`/affiliate/activations/${created.id}`);
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

export default function AffiliateActivate({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { template, geos, bank, landingUrl, landingBlocked } = loaderData;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Activar: {template.name}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Completa los pasos y envía tu comprobante para revisión.
        </p>
      </div>

      {landingBlocked || !landingUrl ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm">
          {landingBlocked ??
            "No se pudo generar la URL de landing. Contacta a tu líder."}
        </div>
      ) : null}

      {geos.length === 0 ? (
        <p className="text-destructive text-sm">
          Esta campaña no tiene ubicaciones configuradas; no se puede activar.
        </p>
      ) : !bank ? (
        <p className="text-destructive text-sm">
          Tu organización no ha configurado datos bancarios. Avísale al líder.
        </p>
      ) : landingUrl ? (
        <ActivationWizard
          template={template}
          geos={geos}
          bank={bank}
          landingUrl={landingUrl}
          actionError={actionData}
        />
      ) : null}
    </div>
  );
}
