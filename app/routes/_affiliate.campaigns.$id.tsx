import { data, Link } from "react-router";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { requireAffiliate } from "~/lib/auth.server";
import type { Route } from "./+types/_affiliate.campaigns.$id";

export async function loader({ request, params }: Route.LoaderArgs) {
  const { supabase, user, headers } = await requireAffiliate(request);
  const id = params.id;
  if (!id) {
    throw new Response("Not found", { status: 404, headers });
  }

  const { data: template, error } = await supabase
    .from("campaign_templates")
    .select(
      "id, name, copy_base, min_budget, max_budget, campaign_objective, assets (file_url, file_type, sort_order, created_at), allowed_geos (id, label, country_code, region, city)",
    )
    .eq("id", id)
    .eq("org_id", user.orgId)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    throw new Response(error.message, { status: 500, headers });
  }
  if (!template) {
    throw new Response("Campaña no encontrada", { status: 404, headers });
  }

  const assets = Array.isArray(template.assets) ? template.assets : [];
  const sortedAssets = [...assets].sort((a, b) => {
    const ao = a.sort_order ?? 0;
    const bo = b.sort_order ?? 0;
    if (ao !== bo) return ao - bo;
    return 0;
  });
  const geos = Array.isArray(template.allowed_geos) ? template.allowed_geos : [];

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
          file_type: a.file_type,
        })),
        geos,
      },
    },
    { headers },
  );
}

export default function AffiliateCampaignDetail({
  loaderData,
}: Route.ComponentProps) {
  const { template } = loaderData;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{template.name}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Objetivo: {template.campaign_objective}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Copy base</CardTitle>
            <CardDescription>Texto principal del anuncio.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{template.copy_base}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Presupuesto</CardTitle>
            <CardDescription>Rango permitido para activar.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-medium">
              {template.min_budget} – {template.max_budget}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Creativos</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {template.assets.length === 0 ? (
            <p className="text-muted-foreground text-sm">Sin assets.</p>
          ) : (
            template.assets.map((a, i) => (
              <div key={i} className="overflow-hidden rounded-lg border">
                {a.file_type === "image" ? (
                  <img
                    src={a.file_url}
                    alt=""
                    className="aspect-square w-full object-cover"
                  />
                ) : (
                  <video
                    src={a.file_url}
                    className="aspect-square w-full object-cover"
                    controls
                    muted
                  />
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Geos disponibles</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {template.geos.map((g) => (
            <Badge key={g.id} variant="secondary">
              {g.label} ({g.country_code})
            </Badge>
          ))}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link to={`/affiliate/activate/${template.id}`}>
            Activar esta campaña
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/affiliate/campaigns">Volver al listado</Link>
        </Button>
      </div>
    </div>
  );
}
