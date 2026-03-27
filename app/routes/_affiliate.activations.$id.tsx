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
import type { Route } from "./+types/_affiliate.activations.$id";

export async function loader({ request, params }: Route.LoaderArgs) {
  const { supabase, user, headers } = await requireAffiliate(request);
  const id = params.id;
  if (!id) {
    throw new Response("Not found", { status: 404, headers });
  }

  const { data: activation, error: aErr } = await supabase
    .from("campaign_activations")
    .select("*")
    .eq("id", id)
    .eq("affiliate_id", user.id)
    .maybeSingle();

  if (aErr) {
    throw new Response(aErr.message, { status: 500, headers });
  }
  if (!activation) {
    throw new Response("No encontrado", { status: 404, headers });
  }

  const [{ data: template }, { data: geo }, { data: payment }] = await Promise.all([
    supabase
      .from("campaign_templates")
      .select("name, copy_base, min_budget, max_budget")
      .eq("id", activation.template_id)
      .single(),
    supabase
      .from("allowed_geos")
      .select("label, country_code, region, city")
      .eq("id", activation.selected_geo_id)
      .single(),
    supabase
      .from("payments")
      .select("proof_url, amount, status, created_at, rejection_reason")
      .eq("activation_id", activation.id)
      .maybeSingle(),
  ]);

  return data(
    {
      activation,
      templateName: template?.name ?? "—",
      templateCopy: template?.copy_base ?? "",
      geoLabel: geo?.label ?? "—",
      geoCountry: geo?.country_code ?? "",
      payment,
    },
    { headers },
  );
}

export default function AffiliateActivationDetail({
  loaderData,
}: Route.ComponentProps) {
  const {
    activation,
    templateName,
    templateCopy,
    geoLabel,
    geoCountry,
    payment,
  } = loaderData;

  const timeline = [
    { label: "Creada", at: activation.created_at },
    { label: "Actualizada", at: activation.updated_at },
  ];
  if (activation.activated_at) {
    timeline.push({ label: "Activada en Meta (aprox.)", at: activation.activated_at });
  }
  if (activation.completed_at) {
    timeline.push({ label: "Completada", at: activation.completed_at });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{templateName}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Solicitud del{" "}
            {new Date(activation.created_at).toLocaleString("es-MX")}
          </p>
        </div>
        <Badge variant={activationStatusBadgeVariant(activation.status)}>
          {activation.status}
        </Badge>
      </div>

      {activation.rejection_reason ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <p className="font-medium">Motivo de rechazo</p>
          <p className="mt-1 whitespace-pre-wrap">{activation.rejection_reason}</p>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Resumen</CardTitle>
            <CardDescription>Datos de tu solicitud.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">Presupuesto: </span>
              {activation.budget}
            </p>
            <p>
              <span className="text-muted-foreground">Ubicación: </span>
              {geoLabel} ({geoCountry})
            </p>
            <p>
              <span className="text-muted-foreground">Landing: </span>
              <a
                className="text-primary break-all underline"
                href={activation.landing_url}
                target="_blank"
                rel="noreferrer"
              >
                {activation.landing_url}
              </a>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Comprobante</CardTitle>
            <CardDescription>Pago registrado.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {payment ? (
              <>
                <p>
                  <span className="text-muted-foreground">Monto: </span>
                  {payment.amount}
                </p>
                <p>
                  <span className="text-muted-foreground">Estado pago: </span>
                  {payment.status}
                </p>
                {payment.rejection_reason ? (
                  <p className="text-destructive whitespace-pre-wrap">
                    {payment.rejection_reason}
                  </p>
                ) : null}
                <p>
                  <a
                    className="text-primary font-medium underline"
                    href={payment.proof_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Ver comprobante
                  </a>
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">Sin comprobante registrado.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Copy de la campaña</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm whitespace-pre-wrap">{templateCopy}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Historial</CardTitle>
          <CardDescription>
            Las métricas de Meta se mostrarán aquí en una fase posterior.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {timeline.map((t) => (
              <li key={t.label} className="flex justify-between gap-4">
                <span className="text-muted-foreground">{t.label}</span>
                <span>
                  {t.at
                    ? new Date(t.at).toLocaleString("es-MX")
                    : "—"}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Button asChild variant="outline">
        <Link to="/affiliate/activations">Volver al listado</Link>
      </Button>
    </div>
  );
}
