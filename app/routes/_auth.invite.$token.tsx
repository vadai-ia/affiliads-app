import { data, Form, redirect, useNavigation } from "react-router";
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
  actionError,
  actionSuccess,
  formatZodFieldErrors,
} from "~/lib/errors";
import { getSiteUrl, getServerEnv } from "~/lib/env.server";
import { getSupabaseAdmin } from "~/lib/supabase.admin.server";
import type { Route } from "./+types/_auth.invite.$token";

const acceptSchema = z.object({
  fullName: z.string().min(2, "Nombre demasiado corto"),
});

export async function loader({ params }: Route.LoaderArgs) {
  getServerEnv();
  const admin = getSupabaseAdmin();
  const token = params.token;
  if (!token) {
    throw redirect("/login");
  }

  const { data: invite, error } = await admin
    .from("invitation_tokens")
    .select("id, org_id, email, subdomain, expires_at, used_at")
    .eq("token", token)
    .maybeSingle();

  if (error || !invite) {
    throw redirect("/login?error=invite_invalid");
  }
  if (invite.used_at) {
    throw redirect("/login?error=invite_used");
  }
  if (new Date(invite.expires_at) < new Date()) {
    throw redirect("/login?error=invite_expired");
  }

  const { data: org } = await admin
    .from("organizations")
    .select("name, slug")
    .eq("id", invite.org_id)
    .maybeSingle();

  return {
    email: invite.email,
    subdomain: invite.subdomain,
    orgName: org?.name ?? "",
    token,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  getServerEnv();
  const siteUrl = getSiteUrl();
  const admin = getSupabaseAdmin();
  const token = params.token;
  if (!token) {
    return data(actionError("Token inválido"));
  }

  const formData = await request.formData();
  const parsed = acceptSchema.safeParse({
    fullName: formData.get("fullName"),
  });
  if (!parsed.success) {
    return data(
      actionError("Revisa el formulario", formatZodFieldErrors(parsed.error)),
    );
  }

  const { data: invite, error: invErr } = await admin
    .from("invitation_tokens")
    .select("id, org_id, email, subdomain, expires_at, used_at")
    .eq("token", token)
    .maybeSingle();

  if (invErr || !invite || invite.used_at) {
    return data(actionError("La invitación ya no es válida"));
  }
  if (new Date(invite.expires_at) < new Date()) {
    return data(actionError("La invitación expiró"));
  }

  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    email: invite.email,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.fullName },
  });

  if (authErr || !authData.user) {
    return data(
      actionError(authErr?.message || "No se pudo crear la cuenta"),
    );
  }

  const { error: userErr } = await admin.from("users").insert({
    id: authData.user.id,
    org_id: invite.org_id,
    role: "affiliate",
    email: invite.email,
    full_name: parsed.data.fullName,
    subdomain: invite.subdomain,
  });

  if (userErr) {
    await admin.auth.admin.deleteUser(authData.user.id);
    return data(actionError(userErr.message || "No se pudo crear el perfil"));
  }

  const { error: updErr } = await admin
    .from("invitation_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("id", invite.id)
    .is("used_at", null);

  if (updErr) {
    return data(actionError("No se pudo marcar la invitación como usada"));
  }

  const { data: linkData, error: linkErr } =
    await admin.auth.admin.generateLink({
      type: "magiclink",
      email: invite.email,
      options: {
        redirectTo: `${siteUrl.replace(/\/$/, "")}/auth/callback`,
      },
    });

  if (linkErr || !linkData?.properties?.action_link) {
    return data(
      actionSuccess(
        undefined,
        "Cuenta lista. Usa «Iniciar sesión» para recibir el enlace.",
      ),
    );
  }

  throw redirect(linkData.properties.action_link);
}

export default function InviteAccept({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";
  const err = actionData && "error" in actionData && actionData.error;
  const msg =
    actionData && "error" in actionData && !actionData.error
      ? actionData.message
      : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Unirte a {loaderData.orgName}</CardTitle>
        <CardDescription>
          Completa tu nombre para activar tu cuenta de afiliado.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form method="post" className="space-y-4">
          <div className="space-y-2">
            <Label>Correo</Label>
            <Input value={loaderData.email} readOnly className="bg-muted" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fullName">Nombre completo</Label>
            <Input id="fullName" name="fullName" required />
            {err && actionData?.fieldErrors?.fullName ? (
              <p className="text-destructive text-sm">
                {actionData.fieldErrors.fullName}
              </p>
            ) : null}
          </div>
          {err && actionData?.message ? (
            <p className="text-destructive text-sm">{actionData.message}</p>
          ) : null}
          {msg ? <p className="text-sm text-green-600">{msg}</p> : null}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Creando…" : "Continuar"}
          </Button>
        </Form>
      </CardContent>
    </Card>
  );
}
