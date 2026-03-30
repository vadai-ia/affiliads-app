import { data, Link, redirect } from "react-router";
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
import { activationStatusBadgeVariant } from "~/lib/activations";
import type { Database } from "~/types/database";
import type { Route } from "./+types/_leader.activations._index";

type ActivationStatus = Database["public"]["Tables"]["campaign_activations"]["Row"]["status"];

const STATUS_OPTIONS: Array<ActivationStatus | "all"> = [
  "all",
  "pending_approval",
  "queued",
  "activating",
  "active",
  "rejected",
  "failed",
  "pending_payment",
  "paused",
  "completed",
];

const PAGE_SIZE = 20;

/** Query string para listado con filtro + página (page 1 omite `page`). */
function activationsListHref(statusFilter: string, pageNum: number): string {
  const p = new URLSearchParams();
  if (statusFilter !== "all") p.set("status", statusFilter);
  if (pageNum > 1) p.set("page", String(pageNum));
  const qs = p.toString();
  return qs ? `/leader/activations?${qs}` : "/leader/activations";
}

function parsePage(searchParams: URLSearchParams): number {
  const raw = searchParams.get("page");
  if (raw == null || raw === "") return 1;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, user, headers } = await requireLeader(request);
  const url = new URL(request.url);
  const raw = url.searchParams.get("status");
  const statusFilter =
    raw && STATUS_OPTIONS.includes(raw as ActivationStatus | "all") && raw !== "all"
      ? (raw as ActivationStatus)
      : null;

  const requestedPage = parsePage(url.searchParams);

  let countQ = supabase
    .from("campaign_activations")
    .select("*", { count: "exact", head: true })
    .eq("org_id", user.orgId);

  if (statusFilter) {
    countQ = countQ.eq("status", statusFilter);
  }

  const { count: totalCount, error: countErr } = await countQ;

  if (countErr) {
    throw new Response(countErr.message, { status: 500, headers });
  }

  const total = totalCount ?? 0;

  if (total === 0) {
    return data(
      {
        statusFilter: statusFilter ?? "all",
        activations: [],
        page: 1,
        pageSize: PAGE_SIZE,
        totalCount: 0,
        totalPages: 0,
      },
      { headers },
    );
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const page = Math.min(Math.max(1, requestedPage), totalPages);

  if (requestedPage !== page) {
    const u = new URL(request.url);
    if (page <= 1) {
      u.searchParams.delete("page");
    } else {
      u.searchParams.set("page", String(page));
    }
    throw redirect(u.pathname + u.search);
  }

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let q = supabase
    .from("campaign_activations")
    .select("id, status, created_at, budget, template_id, affiliate_id")
    .eq("org_id", user.orgId);

  if (statusFilter) {
    q = q.eq("status", statusFilter);
  }

  const { data: rows, error } = await q
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    throw new Response(error.message, { status: 500, headers });
  }

  const templateIds = [...new Set((rows ?? []).map((r) => r.template_id))];
  const affiliateIds = [...new Set((rows ?? []).map((r) => r.affiliate_id))];

  const [{ data: templates }, { data: affiliates }] = await Promise.all([
    templateIds.length
      ? supabase
          .from("campaign_templates")
          .select("id, name")
          .in("id", templateIds)
      : { data: [] as { id: string; name: string }[] },
    affiliateIds.length
      ? supabase
          .from("users")
          .select("id, full_name, email")
          .in("id", affiliateIds)
      : { data: [] as { id: string; full_name: string | null; email: string }[] },
  ]);

  const templateName = new Map((templates ?? []).map((t) => [t.id, t.name]));
  const affiliateLabel = new Map(
    (affiliates ?? []).map((a) => [
      a.id,
      a.full_name?.trim() || a.email,
    ]),
  );

  const activations =
    rows?.map((r) => ({
      id: r.id,
      status: r.status,
      created_at: r.created_at,
      budget: r.budget,
      templateName: templateName.get(r.template_id) ?? "—",
      affiliateLabel: affiliateLabel.get(r.affiliate_id) ?? "—",
    })) ?? [];

  return data(
    {
      statusFilter: statusFilter ?? "all",
      activations,
      page,
      pageSize: PAGE_SIZE,
      totalCount: total,
      totalPages,
    },
    { headers },
  );
}

export default function LeaderActivationsIndex({
  loaderData,
}: Route.ComponentProps) {
  const {
    statusFilter,
    activations,
    page,
    pageSize,
    totalCount,
    totalPages,
  } = loaderData;

  const fromRow = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const toRow = Math.min(page * pageSize, totalCount);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Solicitudes de activación
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Revisa comprobantes y aprueba o rechaza pagos.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtro</CardTitle>
          <CardDescription>Estado de la activación.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.map((s) => {
            const href = activationsListHref(s === "all" ? "all" : s, 1);
            const active =
              (s === "all" && statusFilter === "all") ||
              s === statusFilter;
            return (
              <Link
                key={s}
                to={href}
                className={
                  active
                    ? "rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground"
                    : "rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
                }
              >
                {s === "all" ? "Todas" : s}
              </Link>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Listado</CardTitle>
        </CardHeader>
        <CardContent>
          {activations.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No hay solicitudes con este filtro.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Afiliado</TableHead>
                  <TableHead>Campaña</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Presupuesto</TableHead>
                  <TableHead>Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activations.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>{a.affiliateLabel}</TableCell>
                    <TableCell>
                      <Link
                        className="text-primary font-medium underline-offset-4 hover:underline"
                        to={`/leader/activations/${a.id}`}
                      >
                        {a.templateName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant={activationStatusBadgeVariant(a.status)}>
                        {a.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{a.budget}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {new Date(a.created_at).toLocaleString("es-MX")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {totalPages > 1 ? (
            <div className="mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-muted-foreground text-sm">
                Mostrando {fromRow}–{toRow} de {totalCount} (página {page} de{" "}
                {totalPages})
              </p>
              <div className="flex flex-wrap gap-2">
                {page <= 1 ? (
                  <Button variant="outline" size="sm" disabled>
                    Anterior
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" asChild>
                    <Link
                      to={activationsListHref(statusFilter, page - 1)}
                      prefetch="intent"
                    >
                      Anterior
                    </Link>
                  </Button>
                )}
                {page >= totalPages ? (
                  <Button variant="outline" size="sm" disabled>
                    Siguiente
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" asChild>
                    <Link
                      to={activationsListHref(statusFilter, page + 1)}
                      prefetch="intent"
                    >
                      Siguiente
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          ) : totalCount > 0 ? (
            <p className="text-muted-foreground mt-4 border-t pt-4 text-sm">
              {totalCount === 1
                ? "1 solicitud"
                : `${totalCount} solicitudes`}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
