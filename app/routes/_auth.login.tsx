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
import { actionError, actionSuccess, formatZodFieldErrors } from "~/lib/errors";
import { checkRateLimit, clientIp } from "~/lib/rate-limit.server";
import { createSupabaseServerClient } from "~/lib/supabase.server";
import { getSiteUrl } from "~/lib/env.server";
import type { Route } from "./+types/_auth.login";

const schema = z.object({
  email: z.string().email("Correo inválido"),
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
  const siteUrl = getSiteUrl();
  const { supabase, headers } = createSupabaseServerClient(request);
  const ip = clientIp(request);
  const limited = checkRateLimit(`login:${ip}`, 5, 60_000);
  if (!limited.ok) {
    return data(
      actionError(
        "Demasiados intentos. Espera un momento e inténtalo de nuevo.",
      ),
      { status: 429, headers },
    );
  }

  const formData = await request.formData();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return data(
      actionError("Revisa el formulario", formatZodFieldErrors(parsed.error)),
      { headers },
    );
  }

  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      emailRedirectTo: `${siteUrl.replace(/\/$/, "")}/auth/callback`,
    },
  });

  if (error) {
    return data(
      actionError(error.message || "No se pudo enviar el enlace"),
      { headers },
    );
  }

  return data(
    actionSuccess(undefined, "Revisa tu correo para el enlace de acceso."),
    { headers },
  );
}

export default function Login({ actionData }: Route.ComponentProps) {
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
        <CardTitle>Iniciar sesión</CardTitle>
        <CardDescription>
          Te enviaremos un enlace mágico a tu correo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form method="post" className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Correo</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="tu@correo.com"
            />
            {err && actionData?.fieldErrors?.email ? (
              <p className="text-destructive text-sm">
                {actionData.fieldErrors.email}
              </p>
            ) : null}
          </div>
          {err && actionData?.message ? (
            <p className="text-destructive text-sm">{actionData.message}</p>
          ) : null}
          {msg ? <p className="text-sm text-green-600">{msg}</p> : null}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Enviando…" : "Enviar enlace"}
          </Button>
        </Form>
        <p className="mt-4 text-center text-muted-foreground text-sm">
          ¿Eres líder y aún no tienes cuenta?{" "}
          <Link to="/register" className="text-primary underline">
            Registrarse
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
