import { data, Link } from "react-router";
import { Badge } from "~/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { requireAffiliate } from "~/lib/auth.server";
import type { Route } from "./+types/_affiliate.campaigns._index";

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, user, headers } = await requireAffiliate(request);

  const { data: templates, error } = await supabase
    .from("campaign_templates")
    .select(
      "id, name, min_budget, max_budget, copy_base, campaign_objective, assets (file_url, file_type, sort_order, created_at), allowed_geos (id, label, country_code)",
    )
    .eq("org_id", user.orgId)
    .eq("status", "active")
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Response(error.message, { status: 500, headers });
  }

  type GeoRow = { id: string; label: string; country_code: string };

  const rows =
    templates?.map((t) => {
      const assets = Array.isArray(t.assets) ? t.assets : [];
      const sorted = [...assets].sort((a, b) => {
        const ao = a.sort_order ?? 0;
        const bo = b.sort_order ?? 0;
        if (ao !== bo) return ao - bo;
        return 0;
      });
      const first = sorted[0];
      const geos: GeoRow[] = Array.isArray(t.allowed_geos)
        ? (t.allowed_geos as GeoRow[])
        : [];
      return {
        id: t.id,
        name: t.name,
        min_budget: t.min_budget,
        max_budget: t.max_budget,
        copy_base: t.copy_base,
        campaign_objective: t.campaign_objective,
        previewUrl: first?.file_url ?? null,
        previewType: first?.file_type ?? null,
        geos,
      };
    }) ?? [];

  return data({ templates: rows }, { headers });
}

export default function AffiliateCampaignsIndex({
  loaderData,
}: Route.ComponentProps) {
  const { templates } = loaderData;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Campañas</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Elige una campaña activa para ver el detalle y solicitarla.
        </p>
      </div>

      {templates.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No hay campañas activas por ahora.
        </p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {templates.map((t) => (
            <li key={t.id}>
              <Card className="h-full overflow-hidden">
                <div className="bg-muted relative aspect-video w-full">
                  {t.previewUrl && t.previewType === "image" ? (
                    <img
                      src={t.previewUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : t.previewUrl && t.previewType === "video" ? (
                    <video
                      src={t.previewUrl}
                      className="h-full w-full object-cover"
                      muted
                      controls
                    />
                  ) : (
                    <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
                      Sin preview
                    </div>
                  )}
                </div>
                <CardHeader>
                  <CardTitle className="text-lg">{t.name}</CardTitle>
                  <CardDescription className="line-clamp-2">
                    {t.copy_base}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-muted-foreground text-sm">
                    Presupuesto: {t.min_budget} – {t.max_budget}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {t.geos.slice(0, 4).map((g) => (
                      <Badge key={g.id} variant="secondary">
                        {g.label}
                      </Badge>
                    ))}
                    {t.geos.length > 4 ? (
                      <Badge variant="outline">+{t.geos.length - 4}</Badge>
                    ) : null}
                  </div>
                  <Link
                    className="text-primary inline-block text-sm font-medium underline-offset-4 hover:underline"
                    to={`/affiliate/campaigns/${t.id}`}
                  >
                    Ver detalle
                  </Link>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
