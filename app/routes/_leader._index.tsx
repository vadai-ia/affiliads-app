import { data, Link } from "react-router";
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
import type { Route } from "./+types/_leader._index";

type MetricPick = Pick<
  Database["public"]["Tables"]["campaign_metrics"]["Row"],
  "activation_id" | "date" | "spend" | "leads" | "cpl" | "synced_at"
>;

function latestMetricByActivation(rows: MetricPick[]): Map<string, MetricPick> {
  const m = new Map<string, MetricPick>();
  for (const r of rows) {
    if (!m.has(r.activation_id)) m.set(r.activation_id, r);
  }
  return m;
}

function daysSince(startIso: string | null, fallbackIso: string): number {
  const start = startIso ? new Date(startIso) : new Date(fallbackIso);
  if (Number.isNaN(start.getTime())) return 0;
  return Math.max(
    0,
    Math.floor((Date.now() - start.getTime()) / 86_400_000),
  );
}

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, user, headers } = await requireLeader(request);

  const { data: statusRows } = await supabase
    .from("campaign_activations")
    .select("status")
    .eq("org_id", user.orgId);

  const counts: Record<string, number> = {};
  for (const row of statusRows ?? []) {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
  }

  const pendingApproval = counts.pending_approval ?? 0;
  const activating = counts.activating ?? 0;
  const active = counts.active ?? 0;

  const { data: pendingList } = await supabase
    .from("campaign_activations")
    .select("id, created_at, budget, template_id, affiliate_id")
    .eq("org_id", user.orgId)
    .eq("status", "pending_approval")
    .order("created_at", { ascending: false })
    .limit(8);

  const ids = pendingList ?? [];
  const templateIds = [...new Set(ids.map((r) => r.template_id))];
  const affiliateIds = [...new Set(ids.map((r) => r.affiliate_id))];

  const [{ data: templates }, { data: affiliates }] = await Promise.all([
    templateIds.length
      ? supabase.from("campaign_templates").select("id, name").in("id", templateIds)
      : { data: [] as { id: string; name: string }[] },
    affiliateIds.length
      ? supabase.from("users").select("id, full_name, email").in("id", affiliateIds)
      : { data: [] as { id: string; full_name: string | null; email: string }[] },
  ]);

  const tName = new Map((templates ?? []).map((t) => [t.id, t.name]));
  const aLabel = new Map(
    (affiliates ?? []).map((a) => [a.id, a.full_name?.trim() || a.email]),
  );

  const queue =
    ids.map((r) => ({
      id: r.id,
      created_at: r.created_at,
      budget: r.budget,
      templateName: tName.get(r.template_id) ?? "—",
      affiliateLabel: aLabel.get(r.affiliate_id) ?? "—",
    })) ?? [];

  const { data: activeActs } = await supabase
    .from("campaign_activations")
    .select(
      "id, budget, activated_at, created_at, template_id, affiliate_id, meta_campaign_id",
    )
    .eq("org_id", user.orgId)
    .eq("status", "active")
    .not("meta_campaign_id", "is", null)
    .order("activated_at", { ascending: false })
    .limit(24);

  const activeList = activeActs ?? [];
  const activeIds = activeList.map((r) => r.id);
  const activeTemplateIds = [...new Set(activeList.map((r) => r.template_id))];
  const activeAffiliateIds = [...new Set(activeList.map((r) => r.affiliate_id))];

  const [{ data: activeTemplates }, { data: activeAffiliates }, { data: activeMetrics }] =
    await Promise.all([
      activeTemplateIds.length
        ? supabase
            .from("campaign_templates")
            .select("id, name")
            .in("id", activeTemplateIds)
        : { data: [] as { id: string; name: string }[] },
      activeAffiliateIds.length
        ? supabase
            .from("users")
            .select("id, full_name, email")
            .in("id", activeAffiliateIds)
        : { data: [] as { id: string; full_name: string | null; email: string }[] },
      activeIds.length
        ? supabase
            .from("campaign_metrics")
            .select(
              "activation_id, date, spend, leads, cpl, synced_at",
            )
            .in("activation_id", activeIds)
            .order("date", { ascending: false })
        : { data: [] as MetricPick[] },
    ]);

  const atName = new Map((activeTemplates ?? []).map((t) => [t.id, t.name]));
  const aaLabel = new Map(
    (activeAffiliates ?? []).map((a) => [a.id, a.full_name?.trim() || a.email]),
  );
  const latestM = latestMetricByActivation((activeMetrics ?? []) as MetricPick[]);

  const fmtMoney = (n: number) =>
    new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      maximumFractionDigits: 2,
    }).format(Number.isFinite(n) ? n : 0);

  const activeRows =
    activeList.map((a) => {
      const m = latestM.get(a.id);
      const budgetNum = Number.parseFloat(a.budget);
      const spendNum = m?.spend ? Number.parseFloat(m.spend) : 0;
      const cplNum = m?.cpl ? Number.parseFloat(m.cpl) : null;
      return {
        id: a.id,
        templateName: atName.get(a.template_id) ?? "—",
        affiliateLabel: aaLabel.get(a.affiliate_id) ?? "—",
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
    }) ?? [];

  return data(
    {
      pendingApproval,
      activating,
      active,
      total: statusRows?.length ?? 0,
      queue,
      activeRows,
    },
    { headers },
  );
}

export default function LeaderDashboard({ loaderData }: Route.ComponentProps) {
  const { pendingApproval, activating, active, total, queue, activeRows } =
    loaderData;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Panel de líder</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Resumen operativo y cola de solicitudes pendientes.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/leader/metrics">Ver métricas</Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Pendientes de revisión</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{pendingApproval}</p>
            <Button asChild className="mt-3" size="sm" variant="secondary">
              <Link to="/leader/activations?status=pending_approval">
                Ver cola
              </Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Activando (Meta)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{activating}</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Job en curso o pendiente de Inngest.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Activas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{active}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Total solicitudes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{total}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Campañas activas</CardTitle>
            <CardDescription>
              Gasto y leads según último snapshot diario (sync ~15 min).
            </CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/leader/metrics">Todas</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {activeRows.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No hay campañas en estado <code>active</code> con Meta vinculado.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Afiliado</TableHead>
                  <TableHead>Campaña</TableHead>
                  <TableHead>Días</TableHead>
                  <TableHead>Gasto / presupuesto</TableHead>
                  <TableHead>Leads</TableHead>
                  <TableHead>CPL</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.affiliateLabel}</TableCell>
                    <TableCell>{row.templateName}</TableCell>
                    <TableCell className="tabular-nums">{row.daysActive}</TableCell>
                    <TableCell className="text-sm">
                      <span className="tabular-nums">{row.spendLabel}</span>
                      <span className="text-muted-foreground"> / </span>
                      <span className="tabular-nums">{row.budgetLabel}</span>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {row.leads ?? "—"}
                    </TableCell>
                    <TableCell className="tabular-nums">{row.cplLabel}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="secondary">
                        <Link to={`/leader/activations/${row.id}`}>Detalle</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Próximas revisiones</CardTitle>
            <CardDescription>
              Solicitudes en <code>pending_approval</code>.
            </CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/leader/activations">Todas las solicitudes</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {queue.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No hay solicitudes pendientes de aprobación.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Afiliado</TableHead>
                  <TableHead>Campaña</TableHead>
                  <TableHead>Monto</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {queue.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.affiliateLabel}</TableCell>
                    <TableCell>{row.templateName}</TableCell>
                    <TableCell>{row.budget}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="secondary">
                        <Link to={`/leader/activations/${row.id}`}>
                          Revisar
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Accesos rápidos</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <Link to="/leader/affiliates">Afiliados</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/leader/templates">Templates</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/leader/metrics">Métricas</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/leader/settings/bank">Datos bancarios</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/leader/settings/meta">Meta Ads</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
