import { randomBytes } from "node:crypto";
import { data, Form, useNavigation } from "react-router";
import { z } from "zod";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { actionError, actionSuccess, formatZodFieldErrors } from "~/lib/errors";
import { requireLeader } from "~/lib/auth.server";
import { getSiteUrl } from "~/lib/env.server";
import type { Route } from "./+types/_leader.affiliates";
import { Badge } from "~/components/ui/badge";

const inviteSchema = z.object({
  email: z.string().email("Correo inválido"),
  subdomain: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/, "Solo minúsculas, números y guiones"),
});

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, user } = await requireLeader(request);
  const { data: invites } = await supabase
    .from("invitation_tokens")
    .select("email, subdomain, token, created_at, used_at, expires_at")
    .eq("org_id", user.orgId)
    .order("created_at", { ascending: false });

  return {
    invites: invites ?? [],
    baseUrl: getSiteUrl().replace(/\/$/, ""),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { supabase, user } = await requireLeader(request);
  const formData = await request.formData();
  const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return data(
      actionError("Revisa el formulario", formatZodFieldErrors(parsed.error)),
    );
  }

  const token = randomBytes(24).toString("hex");

  const { error } = await supabase.from("invitation_tokens").insert({
    org_id: user.orgId,
    email: parsed.data.email,
    subdomain: parsed.data.subdomain,
    token,
    invited_by: user.id,
  });

  if (error) {
    return data(
      actionError(
        error.code === "23505"
          ? "Ya existe una invitación para ese correo en tu org"
          : error.message,
      ),
    );
  }

  const base = getSiteUrl().replace(/\/$/, "");
  const inviteUrl = `${base}/invite/${token}`;

  return data(
    actionSuccess({ inviteUrl }, "Invitación creada. Copia el enlace abajo."),
  );
}

export default function LeaderAffiliates({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";
  const err = actionData && "error" in actionData && actionData.error;
  const ok =
    actionData && "error" in actionData && !actionData.error && actionData.data;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Afiliados</h1>
        <p className="text-muted-foreground text-sm">
          Invita afiliados con un enlace único (válido 7 días).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nueva invitación</CardTitle>
          <CardDescription>
            Correo del afiliado y subdominio para su landing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form method="post" className="space-y-4 max-w-md">
            <div className="space-y-2">
              <Label htmlFor="email">Correo del afiliado</Label>
              <Input id="email" name="email" type="email" required />
              {err && actionData?.fieldErrors?.email ? (
                <p className="text-destructive text-sm">
                  {actionData.fieldErrors.email}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="subdomain">Subdominio</Label>
              <Input
                id="subdomain"
                name="subdomain"
                required
                placeholder="juan"
                pattern="[a-z0-9-]+"
              />
              <p className="text-muted-foreground text-xs">
                Quedará como{" "}
                <code className="rounded bg-muted px-1">
                  {"{"}subdominio{"}"}.tu-dominio
                </code>
              </p>
              {err && actionData?.fieldErrors?.subdomain ? (
                <p className="text-destructive text-sm">
                  {actionData.fieldErrors.subdomain}
                </p>
              ) : null}
            </div>
            {err && actionData?.message ? (
              <p className="text-destructive text-sm">{actionData.message}</p>
            ) : null}
            {ok && actionData?.message ? (
              <p className="text-sm text-green-600">{actionData.message}</p>
            ) : null}
            {ok && actionData?.data?.inviteUrl ? (
              <div className="rounded-md border bg-muted/50 p-3 text-sm break-all">
                <span className="text-muted-foreground">Enlace: </span>
                {actionData.data.inviteUrl}
              </div>
            ) : null}
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creando…" : "Crear invitación"}
            </Button>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invitaciones recientes</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Correo</TableHead>
                <TableHead>Subdominio</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Caduca</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loaderData.invites.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    Aún no hay invitaciones.
                  </TableCell>
                </TableRow>
              ) : (
                loaderData.invites.map((row) => (
                  <TableRow key={row.token}>
                    <TableCell>{row.email}</TableCell>
                    <TableCell>{row.subdomain}</TableCell>
                    <TableCell>
                      {row.used_at ? (
                        <Badge variant="secondary">Usada</Badge>
                      ) : new Date(row.expires_at) < new Date() ? (
                        <Badge variant="destructive">Expirada</Badge>
                      ) : (
                        <Badge variant="default">Activa</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {new Date(row.expires_at).toLocaleDateString("es-MX")}
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
