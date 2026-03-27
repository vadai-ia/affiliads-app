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
import { activationStatusBadgeVariant } from "~/lib/activations";
import type { Route } from "./+types/_affiliate.dashboard";

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, user, headers } = await requireAffiliate(request);

  const [{ data: statusRows }, { data: recentTemplates }] = await Promise.all([
    supabase
      .from("campaign_activations")
      .select("status")
      .eq("affiliate_id", user.id),
    supabase
      .from("campaign_templates")
      .select(
        "id, name, min_budget, max_budget, assets (file_url, file_type, sort_order, created_at)",
      )
      .eq("org_id", user.orgId)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(6),
  ]);

  const counts: Record<string, number> = {};
  for (const row of statusRows ?? []) {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
  }

  const campaigns =
    recentTemplates?.map((t) => {
      const assets = Array.isArray(t.assets) ? t.assets : [];
      const sorted = [...assets].sort((a, b) => {
        const ao = a.sort_order ?? 0;
        const bo = b.sort_order ?? 0;
        if (ao !== bo) return ao - bo;
        return 0;
      });
      const first = sorted[0];
      return {
        id: t.id,
        name: t.name,
        min_budget: t.min_budget,
        max_budget: t.max_budget,
        previewUrl: first?.file_url ?? null,
        previewType: first?.file_type ?? null,
      };
    }) ?? [];

  return data(
    {
      counts,
      totalActivations: statusRows?.length ?? 0,
      campaigns,
    },
    { headers },
  );
}

export default function AffiliateDashboard({ loaderData }: Route.ComponentProps) {
  const { counts, totalActivations, campaigns } = loaderData;

  const summary = [
    { key: "pending_approval", label: "Pendientes de aprobación" },
    { key: "pending_payment", label: "Pendientes de pago" },
    { key: "active", label: "Activas" },
    { key: "activating", label: "Activando" },
    { key: "rejected", label: "Rechazadas" },
    { key: "completed", label: "Completadas" },
  ] as const;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Inicio</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Resumen de tus activaciones y campañas disponibles.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Total solicitudes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{totalActivations}</p>
          </CardContent>
        </Card>
        {summary.map((item) => (
          <Card key={item.key}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{item.label}</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-2">
              <p className="text-2xl font-semibold">
                {counts[item.key] ?? 0}
              </p>
              <Badge variant={activationStatusBadgeVariant(item.key)}>
                {item.key}
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Campañas recientes</CardTitle>
            <CardDescription>
              Templates activos que puedes solicitar.
            </CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/affiliate/campaigns">Ver todas</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {campaigns.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Aún no hay campañas activas publicadas por tu organización.
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {campaigns.map((c) => (
                <li key={c.id}>
                  <Link
                    to={`/affiliate/campaigns/${c.id}`}
                    className="flex gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="bg-muted h-16 w-16 shrink-0 overflow-hidden rounded-md">
                      {c.previewUrl && c.previewType === "image" ? (
                        <img
                          src={c.previewUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : c.previewUrl && c.previewType === "video" ? (
                        <video
                          src={c.previewUrl}
                          className="h-full w-full object-cover"
                          muted
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{c.name}</p>
                      <p className="text-muted-foreground text-xs">
                        {c.min_budget} – {c.max_budget}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
