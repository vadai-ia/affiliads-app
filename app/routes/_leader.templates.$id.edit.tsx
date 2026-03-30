import { data } from "react-router";
import { ZodError } from "zod";
import { TemplateEditor } from "~/components/template-editor";
import { requireLeader } from "~/lib/auth.server";
import { actionError, formatZodFieldErrors } from "~/lib/errors";
import { getSupabaseAdmin } from "~/lib/supabase.admin.server";
import {
  formatBudget,
  parseTemplatePayloadFromFormData,
  type TemplatePayload,
} from "~/lib/templates";
import type { Route } from "./+types/_leader.templates.$id.edit";

async function getTemplateForEdit(
  supabase: Awaited<ReturnType<typeof requireLeader>>["supabase"],
  orgId: string,
  id: string,
) {
  const [{ data: template }, { data: assets }, { data: geos }] = await Promise.all([
    supabase
      .from("campaign_templates")
      .select(
        "id, name, campaign_objective, copy_base, min_budget, max_budget, status",
      )
      .eq("id", id)
      .eq("org_id", orgId)
      .maybeSingle(),
    supabase
      .from("assets")
      .select("file_url, file_type, original_name, sort_order")
      .eq("template_id", id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("allowed_geos")
      .select("id, label, country_code, region, city, radius_km")
      .eq("template_id", id)
      .order("created_at", { ascending: true }),
  ]);

  if (!template) return null;

  const initialValue: TemplatePayload = {
    name: template.name,
    campaignObjective: template.campaign_objective as TemplatePayload["campaignObjective"],
    copyBase: template.copy_base,
    minBudget: Number(template.min_budget),
    maxBudget: Number(template.max_budget),
    status: template.status === "active" ? "active" : "draft",
    assets:
      assets?.map((asset) => ({
        fileUrl: asset.file_url,
        storagePath: asset.file_url,
        fileType: asset.file_type,
        originalName: asset.original_name ?? null,
      })) ?? [],
    geos:
      geos?.map((geo) => ({
        id: geo.id,
        label: geo.label,
        countryCode: geo.country_code,
        region: geo.region,
        city: geo.city,
        radiusKm: geo.radius_km,
      })) ?? [],
  };

  return { template, initialValue };
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { supabase, headers, user } = await requireLeader(request);
  const id = params.id;
  if (!id) throw new Response("Template no encontrado", { status: 404, headers });

  const loaded = await getTemplateForEdit(supabase, user.orgId, id);
  if (!loaded) {
    throw new Response("Template no encontrado", { status: 404, headers });
  }

  return data(
    {
      templateId: id,
      initialValue: loaded.initialValue,
    },
    { headers },
  );
}

export async function action({ request, params }: Route.ActionArgs) {
  const { supabase, headers, user } = await requireLeader(request);
  const admin = getSupabaseAdmin();
  const id = params.id;
  if (!id) {
    return data(actionError("Template no encontrado"), { headers, status: 404 });
  }

  const { data: blocking } = await supabase
    .from("campaign_activations")
    .select("id")
    .eq("template_id", id)
    .in("status", ["active", "activating", "queued"])
    .limit(1);

  if ((blocking?.length ?? 0) > 0) {
    return data(
      actionError(
        "No puedes editar un template con activaciones en cola, activando o activas.",
      ),
      { headers, status: 409 },
    );
  }

  const formData = await request.formData();
  try {
    const payload = parseTemplatePayloadFromFormData(formData);

    const { error: updateError } = await supabase
      .from("campaign_templates")
      .update({
        name: payload.name,
        campaign_objective: payload.campaignObjective,
        copy_base: payload.copyBase,
        min_budget: formatBudget(payload.minBudget),
        max_budget: formatBudget(payload.maxBudget),
        status: payload.status,
      })
      .eq("id", id)
      .eq("org_id", user.orgId);

    if (updateError) {
      return data(actionError(updateError.message), { headers });
    }

    await supabase.from("assets").delete().eq("template_id", id);
    await supabase.from("allowed_geos").delete().eq("template_id", id);

    const { error: assetsError } = await supabase.from("assets").insert(
      payload.assets.map((asset, index) => ({
        template_id: id,
        file_url: asset.fileUrl,
        file_type: asset.fileType,
        original_name: asset.originalName ?? null,
        sort_order: index,
      })),
    );

    if (assetsError) {
      return data(actionError(assetsError.message), { headers });
    }

    const { error: geosError } = await supabase.from("allowed_geos").insert(
      payload.geos.map((geo) => ({
        template_id: id,
        label: geo.label,
        country_code: geo.countryCode,
        region: geo.region ?? null,
        city: geo.city ?? null,
        radius_km: geo.radiusKm ?? null,
      })),
    );

    if (geosError) {
      return data(actionError(geosError.message), { headers });
    }

    await admin.from("activity_log").insert({
      org_id: user.orgId,
      user_id: user.id,
      entity_type: "campaign_template",
      entity_id: id,
      action: "template.updated",
      metadata: {
        status: payload.status,
        assets_count: payload.assets.length,
        geos_count: payload.geos.length,
      },
    });

    return Response.redirect(new URL("/leader/templates", request.url), 302);
  } catch (error) {
    if (error instanceof ZodError) {
      return data(
        actionError("Revisa el formulario", formatZodFieldErrors(error)),
        { headers },
      );
    }
    if (error instanceof Error) {
      return data(actionError(error.message), { headers, status: 400 });
    }
    throw error;
  }
}

export default function LeaderTemplatesEdit({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  return (
    <TemplateEditor
      title="Editar template"
      description="Actualiza el copy, assets, geos y presupuesto del template."
      submitLabel="Guardar cambios"
      cancelTo="/leader/templates"
      initialValue={loaderData.initialValue}
      actionError={actionData}
    />
  );
}
