import { data } from "react-router";
import { ZodError } from "zod";
import { TemplateEditor } from "~/components/template-editor";
import { requireLeader } from "~/lib/auth.server";
import { actionError, formatZodFieldErrors } from "~/lib/errors";
import { getSupabaseAdmin } from "~/lib/supabase.admin.server";
import {
  formatBudget,
  parseTemplatePayloadFromFormData,
} from "~/lib/templates";
import type { Route } from "./+types/_leader.templates.new";

export async function loader({ request }: Route.LoaderArgs) {
  const { headers } = await requireLeader(request);
  return data(null, { headers });
}

export async function action({ request }: Route.ActionArgs) {
  const { supabase, headers, user } = await requireLeader(request);
  const admin = getSupabaseAdmin();
  const formData = await request.formData();

  try {
    const payload = parseTemplatePayloadFromFormData(formData);

    const { data: created, error: templateError } = await supabase
      .from("campaign_templates")
      .insert({
        org_id: user.orgId,
        name: payload.name,
        campaign_objective: payload.campaignObjective,
        copy_base: payload.copyBase,
        min_budget: formatBudget(payload.minBudget),
        max_budget: formatBudget(payload.maxBudget),
        status: payload.status,
      })
      .select("id")
      .single();

    if (templateError || !created) {
      return data(
        actionError(templateError?.message ?? "No se pudo crear el template"),
        { headers },
      );
    }

    const geosError = await supabase.from("allowed_geos").insert(
      payload.geos.map((geo) => ({
        template_id: created.id,
        label: geo.label,
        country_code: geo.countryCode,
        region: geo.region ?? null,
        city: geo.city ?? null,
        radius_km: geo.radiusKm ?? null,
      })),
    );

    if (geosError.error) {
      return data(actionError(geosError.error.message), { headers });
    }

    const assetsError = await supabase.from("assets").insert(
      payload.assets.map((asset, index) => ({
        template_id: created.id,
        file_url: asset.fileUrl,
        file_type: asset.fileType,
        original_name: asset.originalName ?? null,
        sort_order: index,
      })),
    );

    if (assetsError.error) {
      return data(actionError(assetsError.error.message), { headers });
    }

    await admin.from("activity_log").insert({
      org_id: user.orgId,
      user_id: user.id,
      entity_type: "campaign_template",
      entity_id: created.id,
      action: "template.created",
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

export default function LeaderTemplatesNew({
  actionData,
}: Route.ComponentProps) {
  return (
    <TemplateEditor
      title="Nuevo template"
      description="Configura la campaña base, sube assets y define las geos permitidas."
      submitLabel="Guardar template"
      cancelTo="/leader/templates"
      actionError={actionData}
    />
  );
}
