import { data, Form, Link, useFetcher } from "react-router";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { requireLeader } from "~/lib/auth.server";
import { actionError, actionSuccess } from "~/lib/errors";
import { getSupabaseAdmin } from "~/lib/supabase.admin.server";
import { statusBadgeVariant, templateListStatuses } from "~/lib/templates";
import type { Route } from "./+types/_leader.templates._index";

const statusSchema = z.enum(templateListStatuses);

const actionSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("duplicate"),
    id: z.string().uuid("Template inválido"),
  }),
  z.object({
    intent: z.literal("archive"),
    id: z.string().uuid("Template inválido"),
  }),
  z.object({
    intent: z.literal("change-status"),
    id: z.string().uuid("Template inválido"),
    status: statusSchema,
  }),
]);

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, headers, user } = await requireLeader(request);
  const url = new URL(request.url);
  const rawStatus = url.searchParams.get("status");
  const statusFilter = rawStatus && rawStatus !== "all" ? rawStatus : null;

  let templateQuery = supabase
    .from("campaign_templates")
    .select("id, name, status, created_at, updated_at")
    .eq("org_id", user.orgId)
    .order("created_at", { ascending: false });

  if (statusFilter) {
    templateQuery = templateQuery.eq(
      "status",
      statusFilter as (typeof templateListStatuses)[number],
    );
  }

  const [{ data: templates, error: templatesError }, { data: activations }] =
    await Promise.all([
      templateQuery,
      supabase
        .from("campaign_activations")
        .select("template_id")
        .eq("org_id", user.orgId),
    ]);

  if (templatesError) {
    throw new Response(templatesError.message, { status: 500, headers });
  }

  const counts = new Map<string, number>();
  for (const row of activations ?? []) {
    counts.set(row.template_id, (counts.get(row.template_id) ?? 0) + 1);
  }

  return data(
    {
      statusFilter: statusFilter ?? "all",
      templates:
        templates?.map((template) => ({
          ...template,
          activationsCount: counts.get(template.id) ?? 0,
        })) ?? [],
    },
    { headers },
  );
}

export async function action({ request }: Route.ActionArgs) {
  const { supabase, headers, user } = await requireLeader(request);
  const admin = getSupabaseAdmin();
  const formData = await request.formData();
  const parsed = actionSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return data(actionError("Acción inválida"), { headers, status: 400 });
  }

  if (parsed.data.intent === "archive") {
    const { error } = await supabase
      .from("campaign_templates")
      .update({ status: "archived" })
      .eq("id", parsed.data.id)
      .eq("org_id", user.orgId);

    if (error) return data(actionError(error.message), { headers });

    await admin.from("activity_log").insert({
      org_id: user.orgId,
      user_id: user.id,
      entity_type: "campaign_template",
      entity_id: parsed.data.id,
      action: "template.archived",
      metadata: {},
    });

    return data(actionSuccess(undefined, "Template archivado."), { headers });
  }

  if (parsed.data.intent === "change-status") {
    const { error } = await supabase
      .from("campaign_templates")
      .update({ status: parsed.data.status })
      .eq("id", parsed.data.id)
      .eq("org_id", user.orgId);

    if (error) return data(actionError(error.message), { headers });

    await admin.from("activity_log").insert({
      org_id: user.orgId,
      user_id: user.id,
      entity_type: "campaign_template",
      entity_id: parsed.data.id,
      action: "template.status_changed",
      metadata: { status: parsed.data.status },
    });

    return data(actionSuccess(undefined, "Status actualizado."), { headers });
  }

  const { data: template, error: templateError } = await supabase
    .from("campaign_templates")
    .select("id, name, campaign_objective, copy_base, min_budget, max_budget")
    .eq("id", parsed.data.id)
    .eq("org_id", user.orgId)
    .single();

  if (templateError || !template) {
    return data(actionError(templateError?.message ?? "Template no encontrado"), {
      headers,
    });
  }

  const [{ data: assets }, { data: geos }] = await Promise.all([
    supabase
      .from("assets")
      .select("file_url, file_type, original_name, sort_order")
      .eq("template_id", template.id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("allowed_geos")
      .select("label, country_code, region, city, radius_km")
      .eq("template_id", template.id)
      .order("created_at", { ascending: true }),
  ]);

  const { data: duplicated, error: duplicateError } = await supabase
    .from("campaign_templates")
    .insert({
      org_id: user.orgId,
      name: `${template.name} (copia)`,
      campaign_objective: template.campaign_objective,
      copy_base: template.copy_base,
      min_budget: template.min_budget,
      max_budget: template.max_budget,
      status: "draft",
    })
    .select("id")
    .single();

  if (duplicateError || !duplicated) {
    return data(
      actionError(duplicateError?.message ?? "No se pudo duplicar el template"),
      { headers },
    );
  }

  if ((assets?.length ?? 0) > 0) {
    await supabase.from("assets").insert(
      (assets ?? []).map((asset, index) => ({
        template_id: duplicated.id,
        file_url: asset.file_url,
        file_type: asset.file_type,
        original_name: asset.original_name,
        sort_order: asset.sort_order ?? index,
      })),
    );
  }

  if ((geos?.length ?? 0) > 0) {
    await supabase.from("allowed_geos").insert(
      (geos ?? []).map((geo) => ({
        template_id: duplicated.id,
        label: geo.label,
        country_code: geo.country_code,
        region: geo.region,
        city: geo.city,
        radius_km: geo.radius_km,
      })),
    );
  }

  await admin.from("activity_log").insert({
    org_id: user.orgId,
    user_id: user.id,
    entity_type: "campaign_template",
    entity_id: duplicated.id,
    action: "template.duplicated",
    metadata: { source_template_id: template.id },
  });

  return data(actionSuccess(undefined, "Template duplicado."), { headers });
}

function RowActions({
  id,
  currentStatus,
}: {
  id: string;
  currentStatus: (typeof templateListStatuses)[number];
}) {
  const fetcher = useFetcher();
  const busy = fetcher.state !== "idle";

  return (
    <fetcher.Form method="post" className="flex flex-wrap gap-2">
      <input type="hidden" name="id" value={id} />
      <Button type="submit" size="sm" variant="outline" name="intent" value="duplicate">
        Duplicar
      </Button>
      <Button type="submit" size="sm" variant="outline" name="intent" value="archive">
        Archivar
      </Button>
      <select
        name="status"
        defaultValue={currentStatus}
        className="border-input bg-background h-8 rounded-md border px-2 text-xs"
      >
        {templateListStatuses.map((status) => (
          <option key={status} value={status}>
            {status}
          </option>
        ))}
      </select>
      <Button
        type="submit"
        size="sm"
        variant="secondary"
        name="intent"
        value="change-status"
        disabled={busy}
      >
        {busy ? "..." : "Cambiar"}
      </Button>
    </fetcher.Form>
  );
}

export default function LeaderTemplatesIndex({ loaderData }: Route.ComponentProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Templates</h1>
          <p className="text-muted-foreground text-sm">
            Gestiona campañas base, assets y geos disponibles para tus afiliados.
          </p>
        </div>
        <Button asChild>
          <Link to="/leader/templates/new">Nuevo template</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Listado</CardTitle>
          <CardDescription>
            Filtra por status y gestiona tus templates publicados o draft.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Form className="flex gap-2" role="search">
            <select
              name="status"
              defaultValue={loaderData.statusFilter}
              className="border-input bg-background h-8 rounded-md border px-3 text-sm"
            >
              <option value="all">Todos</option>
              {templateListStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <Button type="submit" variant="outline">
              Filtrar
            </Button>
          </Form>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Activaciones</TableHead>
                <TableHead>Creado</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loaderData.templates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    Aún no hay templates.
                  </TableCell>
                </TableRow>
              ) : (
                loaderData.templates.map((template) => (
                  <TableRow key={template.id}>
                    <TableCell className="font-medium">{template.name}</TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(template.status)}>
                        {template.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{template.activationsCount}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {new Date(template.created_at).toLocaleDateString("es-MX")}
                    </TableCell>
                    <TableCell className="space-y-2">
                      <Button asChild size="sm" variant="outline">
                        <Link to={`/leader/templates/${template.id}/edit`}>
                          Editar
                        </Link>
                      </Button>
                      <RowActions
                        id={template.id}
                        currentStatus={template.status}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
