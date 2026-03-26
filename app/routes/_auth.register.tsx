import { data, Form, Link, redirect, useNavigation } from "react-router";
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
import { createSupabaseServerClient } from "~/lib/supabase.server";
import type { Route } from "./+types/_auth.register";

const registerSchema = z.object({
  orgName: z.string().min(2, "Nombre demasiado corto"),
  slug: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/, "Solo minúsculas, números y guiones"),
  baseDomain: z.string().min(3, "Dominio inválido"),
  fullName: z.string().min(2, "Nombre demasiado corto"),
  email: z.string().email("Correo inválido"),
  currency: z.enum(["MXN", "USD", "COP", "ARS"]),
});

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, headers } = createSupabaseServerClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.role === "leader") throw redirect("/leader", { headers });
    if (profile?.role === "affiliate") throw redirect("/affiliate", { headers });
  }
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  getServerEnv();
  const siteUrl = getSiteUrl();
  const admin = getSupabaseAdmin();

  const formData = await request.formData();
  const parsed = registerSchema.safeParse({
    orgName: formData.get("orgName"),
    slug: formData.get("slug"),
    baseDomain: formData.get("baseDomain"),
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    currency: formData.get("currency") ?? "MXN",
  });

  if (!parsed.success) {
    return data(
      actionError("Revisa el formulario", formatZodFieldErrors(parsed.error)),
    );
  }

  const { orgName, slug, baseDomain, fullName, email, currency } =
    parsed.data;

  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .insert({
      name: orgName,
      slug,
      base_domain: baseDomain,
      currency,
    })
    .select("id")
    .single();

  if (orgErr || !org) {
    return data(
      actionError(
        orgErr?.message?.includes("duplicate")
          ? "El slug u organización ya existe"
          : orgErr?.message || "No se pudo crear la organización",
      ),
    );
  }

  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (authErr || !authData.user) {
    await admin.from("organizations").delete().eq("id", org.id);
    return data(
      actionError(
        authErr?.message || "No se pudo crear el usuario de acceso",
      ),
    );
  }

  const { error: userErr } = await admin.from("users").insert({
    id: authData.user.id,
    org_id: org.id,
    role: "leader",
    email,
    full_name: fullName,
  });

  if (userErr) {
    await admin.auth.admin.deleteUser(authData.user.id);
    await admin.from("organizations").delete().eq("id", org.id);
    return data(
      actionError(userErr.message || "No se pudo guardar el perfil"),
    );
  }

  const { data: linkData, error: linkErr } =
    await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: {
        redirectTo: `${siteUrl.replace(/\/$/, "")}/auth/callback`,
      },
    });

  if (linkErr || !linkData?.properties?.action_link) {
    return data(
      actionSuccess(
        undefined,
        "Cuenta creada. Usa «Iniciar sesión» para recibir un enlace al correo.",
      ),
    );
  }

  throw redirect(linkData.properties.action_link);
}

export default function Register({ actionData }: Route.ComponentProps) {
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
        <CardTitle>Registrar organización (líder)</CardTitle>
        <CardDescription>
          Crea tu espacio de trabajo y recibe un enlace para entrar.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form method="post" className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="orgName">Nombre de la organización</Label>
            <Input id="orgName" name="orgName" required />
            {err && actionData?.fieldErrors?.orgName ? (
              <p className="text-destructive text-sm">
                {actionData.fieldErrors.orgName}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="slug">Slug (URL)</Label>
            <Input
              id="slug"
              name="slug"
              required
              placeholder="mi-red"
              pattern="[a-z0-9-]+"
            />
            {err && actionData?.fieldErrors?.slug ? (
              <p className="text-destructive text-sm">
                {actionData.fieldErrors.slug}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="baseDomain">Dominio base (landings)</Label>
            <Input
              id="baseDomain"
              name="baseDomain"
              required
              placeholder="midominio.com"
            />
            {err && actionData?.fieldErrors?.baseDomain ? (
              <p className="text-destructive text-sm">
                {actionData.fieldErrors.baseDomain}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="fullName">Tu nombre</Label>
            <Input id="fullName" name="fullName" required />
            {err && actionData?.fieldErrors?.fullName ? (
              <p className="text-destructive text-sm">
                {actionData.fieldErrors.fullName}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Correo</Label>
            <Input id="email" name="email" type="email" required />
            {err && actionData?.fieldErrors?.email ? (
              <p className="text-destructive text-sm">
                {actionData.fieldErrors.email}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="currency">Moneda</Label>
            <select
              id="currency"
              name="currency"
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
              defaultValue="MXN"
            >
              <option value="MXN">MXN</option>
              <option value="USD">USD</option>
              <option value="COP">COP</option>
              <option value="ARS">ARS</option>
            </select>
          </div>
          {err && actionData?.message ? (
            <p className="text-destructive text-sm">{actionData.message}</p>
          ) : null}
          {msg ? <p className="text-sm text-green-600">{msg}</p> : null}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Creando…" : "Crear cuenta"}
          </Button>
        </Form>
        <p className="mt-4 text-center text-muted-foreground text-sm">
          ¿Ya tienes cuenta?{" "}
          <Link to="/login" className="text-primary underline">
            Iniciar sesión
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
