import { data, Link } from "react-router";
import { Badge } from "~/components/ui/badge";
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
import { requireAffiliate } from "~/lib/auth.server";
import { activationStatusBadgeVariant } from "~/lib/activations";
import type { Route } from "./+types/_affiliate.activations._index";

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, user, headers } = await requireAffiliate(request);

  const { data: rows, error } = await supabase
    .from("campaign_activations")
    .select("id, status, created_at, budget, template_id")
    .eq("affiliate_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Response(error.message, { status: 500, headers });
  }

  const templateIds = [...new Set((rows ?? []).map((r) => r.template_id))];
  const { data: nameRows } =
    templateIds.length > 0
      ? await supabase
          .from("campaign_templates")
          .select("id, name")
          .in("id", templateIds)
      : { data: [] as { id: string; name: string }[] };

  const nameById = new Map((nameRows ?? []).map((t) => [t.id, t.name]));

  const list =
    rows?.map((r) => ({
      id: r.id,
      status: r.status,
      created_at: r.created_at,
      budget: r.budget,
      templateName: nameById.get(r.template_id) ?? "—",
    })) ?? [];

  return data({ activations: list }, { headers });
}

export default function AffiliateActivationsIndex({
  loaderData,
}: Route.ComponentProps) {
  const { activations } = loaderData;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Mis activaciones
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Estado de tus solicitudes y campañas.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Listado</CardTitle>
          <CardDescription>
            Haz clic en una fila para ver el detalle.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activations.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Aún no tienes activaciones.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaña</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Presupuesto</TableHead>
                  <TableHead>Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activations.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <Link
                        className="text-primary font-medium underline-offset-4 hover:underline"
                        to={`/affiliate/activations/${a.id}`}
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
        </CardContent>
      </Card>
    </div>
  );
}
