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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { requireLeader } from "~/lib/auth.server";
import type { Database } from "~/types/database";
import type { Route } from "./+types/_leader.metrics";

type ActivationRow = Database["public"]["Tables"]["campaign_activations"]["Row"];
type MetricPick = Pick<
  Database["public"]["Tables"]["campaign_metrics"]["Row"],
  "activation_id" | "date" | "spend" | "impressions" | "clicks" | "leads" | "cpl" | "synced_at"
>;

function daysSince(startIso: string | null, fallbackIso: string): number {
  const start = startIso ? new Date(startIso) : new Date(fallbackIso);
  if (Number.isNaN(start.getTime())) return 0;
  return Math.max(
    0,
    Math.floor((Date.now() - start.getTime()) / 86_400_000),
  );
}

function latestMetricByActivation(
  rows: MetricPick[],
): Map<string, MetricPick> {
  const m = new Map<string, MetricPick>();
  for (const r of rows) {
    if (!m.has(r.activation_id)) m.set(r.activation_id, r);
  }
  return m;
}

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, user, headers } = await requireLeader(request);

  const { data: activations, error: aErr } = await supabase
    .from("campaign_activations")
    .select(
      "id, status, budget, activated_at, created_at, template_id, affiliate_id, meta_campaign_id",
    )
    .eq("org_id", user.orgId)
    .not("meta_campaign_id", "is", null)
    .in("status", ["active", "paused", "completed"])
    .order("updated_at", { ascending: false })
    .limit(200);

  if (aErr) {
    throw new Response(aErr.message, { status: 500, headers });
  }

  const list = (activations ?? []) as Pick<
    ActivationRow,
    | "id"
    | "status"
    | "budget"
    | "activated_at"
    | "created_at"
    | "template_id"
    | "affiliate_id"
  >[];

  const ids = list.map((r) => r.id);
  const templateIds = [...new Set(list.map((r) => r.template_id))];
  const affiliateIds = [...new Set(list.map((r) => r.affiliate_id))];

  const [{ data: templates }, { data: affiliates }, { data: metricRows }] =
    await Promise.all([
      templateIds.length
        ? supabase.from("campaign_templates").select("id, name").in("id", templateIds)
        : { data: [] as { id: string; name: string }[] },
      affiliateIds.length
        ? supabase.from("users").select("id, full_name, email").in("id", affiliateIds)
        : { data: [] as { id: string; full_name: string | null; email: string }[] },
      ids.length
        ? supabase
            .from("campaign_metrics")
            .select(
              "activation_id, date, spend, impressions, clicks, leads, cpl, synced_at",
            )
            .in("activation_id", ids)
            .order("date", { ascending: false })
        : { data: [] as MetricPick[] },
    ]);

  const tName = new Map((templates ?? []).map((t) => [t.id, t.name]));
  const aLabel = new Map(
    (affiliates ?? []).map((a) => [a.id, a.full_name?.trim() || a.email]),
  );
  const latest = latestMetricByActivation((metricRows ?? []) as MetricPick[]);

  const fmtMoney = (n: number) =>
    new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      maximumFractionDigits: 2,
    }).format(Number.isFinite(n) ? n : 0);

  const rows = list.map((a) => {
    const m = latest.get(a.id);
    const budgetNum = Number.parseFloat(a.budget);
    const spendNum = m?.spend ? Number.parseFloat(m.spend) : 0;
    const cplNum = m?.cpl ? Number.parseFloat(m.cpl) : null;
    return {
      id: a.id,
      status: a.status,
      templateName: tName.get(a.template_id) ?? "—",
      affiliateLabel: aLabel.get(a.affiliate_id) ?? "—",
      budgetLabel: fmtMoney(budgetNum),
      spendLabel: m?.spend != null ? fmtMoney(spendNum) : "—",
      leads: m?.leads ?? null,
      cplLabel:
        cplNum != null && Number.isFinite(cplNum) && (m?.leads ?? 0) > 0
          ? fmtMoney(cplNum)
          : "—",
      daysActive: daysSince(a.activated_at, a.created_at),
      syncedAt: m?.synced_at ?? null,
    };
  });

  return data({ rows }, { headers });
}

export default function LeaderMetrics({ loaderData }: Route.ComponentProps) {
  const { rows } = loaderData;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Métricas</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Snapshots diarios por activación (Meta). Campañas con ID en Meta.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/leader">Volver al panel</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Rendimiento</CardTitle>
          <CardDescription>
            Último día con datos en BD para cada activación (no es live de Meta).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No hay campañas con métricas aún (activa una y espera el sync).
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Estado</TableHead>
                    <TableHead>Afiliado</TableHead>
                    <TableHead>Campaña</TableHead>
                    <TableHead>Días activa*</TableHead>
                    <TableHead>Gasto</TableHead>
                    <TableHead>Presupuesto</TableHead>
                    <TableHead>Leads</TableHead>
                    <TableHead>CPL</TableHead>
                    <TableHead>Última sync</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Badge variant="secondary">{r.status}</Badge>
                      </TableCell>
                      <TableCell>{r.affiliateLabel}</TableCell>
                      <TableCell>{r.templateName}</TableCell>
                      <TableCell className="tabular-nums">{r.daysActive}</TableCell>
                      <TableCell className="tabular-nums">{r.spendLabel}</TableCell>
                      <TableCell className="tabular-nums">{r.budgetLabel}</TableCell>
                      <TableCell className="tabular-nums">
                        {r.leads ?? "—"}
                      </TableCell>
                      <TableCell className="tabular-nums">{r.cplLabel}</TableCell>
                      <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                        {r.syncedAt
                          ? new Date(r.syncedAt).toLocaleString("es-MX")
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="secondary">
                          <Link to={`/leader/activations/${r.id}`}>Ver</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="text-muted-foreground mt-4 text-xs">
            *Días desde activación en Meta (o creación si no hay{" "}
            <code>activated_at</code>).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
