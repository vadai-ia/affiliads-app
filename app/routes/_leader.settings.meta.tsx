import { useRef } from "react";
import {
  data,
  Form,
  Link,
  useActionData,
  useFetcher,
  useLoaderData,
  useNavigation,
} from "react-router";
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
import { requireLeader } from "~/lib/auth.server";
import { encryptMetaAccessToken } from "~/lib/crypto.server";
import {
  actionError,
  actionSuccess,
  formatZodFieldErrors,
  type ActionResult,
} from "~/lib/errors";
import {
  getAdAccounts,
  getIGAccounts,
  getPages,
  isMetaApiError,
  validateToken,
  type MetaAdAccount,
  type MetaInstagramAccount,
  type MetaPage,
} from "~/lib/meta/client";
import { getSupabaseAdmin } from "~/lib/supabase.admin.server";
import type { Route } from "./+types/_leader.settings.meta";

const intentSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("validate-token"),
    access_token: z.string().min(1, "Pega el token"),
  }),
  z.object({
    intent: z.literal("load-ig-accounts"),
    access_token: z.string().min(1),
    page_id: z.string().min(1),
  }),
  z.object({
    intent: z.literal("save-connection"),
    access_token: z.string().min(1, "Pega el token"),
    ad_account_id: z.string().min(1, "Elige una cuenta publicitaria"),
    page_id: z.string().min(1, "Elige una página"),
    ig_account_id: z.string().optional(),
  }),
  z.object({
    intent: z.literal("disconnect"),
  }),
]);

export type MetaSettingsActionData = ActionResult<{
  adAccounts?: MetaAdAccount[];
  pages?: MetaPage[];
  igAccounts?: MetaInstagramAccount[];
}>;

export async function loader({ request }: Route.LoaderArgs) {
  const { user, headers } = await requireLeader(request);
  const admin = getSupabaseAdmin();
  const { data: row } = await admin
    .from("meta_connections")
    .select(
      "id, ad_account_id, page_id, ig_account_id, business_id, updated_at",
    )
    .eq("org_id", user.orgId)
    .maybeSingle();

  return data(
    {
      connection: row,
    },
    { headers },
  );
}

export async function action({ request }: Route.ActionArgs) {
  const { user, headers } = await requireLeader(request);
  const admin = getSupabaseAdmin();
  const formData = await request.formData();
  const raw = Object.fromEntries(formData);
  const parsed = intentSchema.safeParse(raw);
  if (!parsed.success) {
    return data(
      actionError("Revisa el formulario", formatZodFieldErrors(parsed.error)),
      { headers },
    );
  }

  const intent = parsed.data.intent;

  if (intent === "disconnect") {
    await admin.from("meta_connections").delete().eq("org_id", user.orgId);
    await admin.from("activity_log").insert({
      org_id: user.orgId,
      user_id: user.id,
      entity_type: "organization",
      entity_id: user.orgId,
      action: "meta.disconnected",
      metadata: {},
    });
    return data(actionSuccess(undefined, "Conexión Meta eliminada."), {
      headers,
    });
  }

  if (intent === "validate-token") {
    try {
      const { access_token } = parsed.data;
      const v = await validateToken(access_token);
      const [adAccounts, pages] = await Promise.all([
        getAdAccounts(access_token),
        getPages(access_token),
      ]);
      await admin.from("activity_log").insert({
        org_id: user.orgId,
        user_id: user.id,
        entity_type: "organization",
        entity_id: user.orgId,
        action: "meta.token_validated",
        metadata: { meta_user_id: v.userId },
      });
      const emptyLists = adAccounts.length === 0 && pages.length === 0;
      const msg = emptyLists
        ? "Token válido pero Meta no devolvió cuentas ni páginas. Genera un token nuevo con permiso business_management y comprueba en Business Manager que el System User tenga asignadas cuentas publicitarias y páginas."
        : "Token válido. Elige cuenta, página e Instagram.";
      return data(actionSuccess({ adAccounts, pages }, msg), { headers });
    } catch (e) {
      if (isMetaApiError(e)) {
        return data(actionError(e.message, undefined, String(e.code)), {
          headers,
        });
      }
      throw e;
    }
  }

  if (intent === "load-ig-accounts") {
    try {
      const { access_token, page_id } = parsed.data;
      const igAccounts = await getIGAccounts(access_token, page_id);
      return data(actionSuccess({ igAccounts }), { headers });
    } catch (e) {
      if (isMetaApiError(e)) {
        return data(actionError(e.message, undefined, String(e.code)), {
          headers,
        });
      }
      throw e;
    }
  }

  if (intent === "save-connection") {
    try {
      const { access_token, ad_account_id, page_id, ig_account_id } =
        parsed.data;
      await validateToken(access_token);
      const adAccounts = await getAdAccounts(access_token);
      const okAd = adAccounts.some(
        (a) => a.id === ad_account_id || a.account_id === ad_account_id,
      );
      if (!okAd) {
        return data(
          actionError("La cuenta publicitaria no coincide con el token."),
          { headers },
        );
      }
      const pages = await getPages(access_token);
      if (!pages.some((p) => p.id === page_id)) {
        return data(actionError("La página no coincide con el token."), {
          headers,
        });
      }
      let igFinal: string | null = null;
      if (ig_account_id && ig_account_id.length > 0) {
        const igList = await getIGAccounts(access_token, page_id);
        if (!igList.some((i) => i.id === ig_account_id)) {
          return data(
            actionError("La cuenta de Instagram no corresponde a la página."),
            { headers },
          );
        }
        igFinal = ig_account_id;
      }
      let stored: string;
      let encryption_key_version: number;
      try {
        const enc = encryptMetaAccessToken(access_token);
        stored = enc.stored;
        encryption_key_version = enc.encryption_key_version;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("ENCRYPTION_KEY") || msg.includes("Missing required env")) {
          return data(
            actionError(
              "Falta ENCRYPTION_KEY en el servidor (hex 64 chars). Ver .env.example.",
            ),
            { headers },
          );
        }
        throw err;
      }
      const upsertPayload = {
        org_id: user.orgId,
        access_token_encrypted: stored,
        ad_account_id,
        page_id,
        ig_account_id: igFinal,
        token_type: "system_user" as const,
        encryption_key_version,
      };
      const { data: saved, error: upErr } = await admin
        .from("meta_connections")
        .upsert(upsertPayload, { onConflict: "org_id" })
        .select("id")
        .single();
      if (upErr || !saved) {
        return data(
          actionError(upErr?.message ?? "No se pudo guardar la conexión"),
          { headers },
        );
      }
      await admin.from("activity_log").insert({
        org_id: user.orgId,
        user_id: user.id,
        entity_type: "meta_connection",
        entity_id: saved.id,
        action: "meta.connection_saved",
        metadata: {
          ad_account_id,
          page_id,
          ig_account_id: igFinal,
        },
      });
      return data(
        actionSuccess(undefined, "Conexión Meta guardada correctamente."),
        { headers },
      );
    } catch (e) {
      if (isMetaApiError(e)) {
        return data(actionError(e.message, undefined, String(e.code)), {
          headers,
        });
      }
      throw e;
    }
  }

  return data(actionError("Acción no reconocida"), { headers });
}

export default function LeaderSettingsMeta() {
  const { connection } = useLoaderData() as {
    connection: {
      id: string;
      ad_account_id: string;
      page_id: string;
      ig_account_id: string | null;
      business_id: string | null;
      updated_at: string;
    } | null;
  };
  const navigation = useNavigation();
  const saveActionData = useActionData<MetaSettingsActionData>();
  const validateFetcher = useFetcher<MetaSettingsActionData>();
  const igFetcher = useFetcher<MetaSettingsActionData>();
  const disconnectFetcher = useFetcher<MetaSettingsActionData>();

  const tokenSaveRef = useRef<HTMLInputElement>(null);
  const pageSelectRef = useRef<HTMLSelectElement>(null);

  const validatePayload = validateFetcher.data;
  const validated =
    validatePayload && !validatePayload.error && validatePayload.data
      ? validatePayload.data
      : null;
  const adAccounts: MetaAdAccount[] = validated?.adAccounts ?? [];
  const pages: MetaPage[] = validated?.pages ?? [];
  const igAccounts: MetaInstagramAccount[] =
    igFetcher.data &&
    !igFetcher.data.error &&
    igFetcher.data.data?.igAccounts
      ? igFetcher.data.data.igAccounts
      : [];

  const isSubmitting =
    navigation.state === "submitting" && navigation.formMethod === "POST";
  const busyValidate = validateFetcher.state !== "idle";
  const busyIg = igFetcher.state !== "idle";
  const busyDisconnect = disconnectFetcher.state !== "idle";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Meta Ads</h1>
        <p className="text-muted-foreground text-sm">
          Conecta un System User token con permisos de anuncios y páginas. El
          token se guarda cifrado y nunca se muestra de nuevo.
        </p>
      </div>

      {connection ? (
        <Card>
          <CardHeader>
            <CardTitle>Conexión activa</CardTitle>
            <CardDescription>
              Cuenta: <code className="text-xs">{connection.ad_account_id}</code>{" "}
              · Página: <code className="text-xs">{connection.page_id}</code>
              {connection.ig_account_id ? (
                <>
                  {" "}
                  · IG:{" "}
                  <code className="text-xs">{connection.ig_account_id}</code>
                </>
              ) : null}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            Actualizado:{" "}
            {new Date(connection.updated_at).toLocaleString("es-MX", {
              dateStyle: "short",
              timeStyle: "short",
            })}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Token de acceso</CardTitle>
          <CardDescription>
            Pega el token (System User), valida y elige cuenta publicitaria,
            página de Facebook e Instagram opcional.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <validateFetcher.Form method="post" className="space-y-3">
            <input type="hidden" name="intent" value="validate-token" />
            <div className="space-y-2">
              <Label htmlFor="access_token_validate">Token</Label>
              <Input
                id="access_token_validate"
                name="access_token"
                type="password"
                autoComplete="off"
                placeholder="Token de larga duración"
              />
            </div>
            {validateFetcher.data?.error ? (
              <p className="text-destructive text-sm">
                {validateFetcher.data.message}
              </p>
            ) : null}
            {validateFetcher.data && !validateFetcher.data.error ? (
              <p className="text-muted-foreground text-sm">
                {validateFetcher.data.message}
              </p>
            ) : null}
            <Button type="submit" disabled={busyValidate}>
              {busyValidate ? "Validando…" : "Validar token"}
            </Button>
          </validateFetcher.Form>

          <Form method="post" className="space-y-4 border-t pt-4">
            <input type="hidden" name="intent" value="save-connection" />
            <div className="space-y-2">
              <Label htmlFor="access_token_save">Token (mismo que validaste)</Label>
              <Input
                id="access_token_save"
                ref={tokenSaveRef}
                name="access_token"
                type="password"
                autoComplete="off"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ad_account_id">Cuenta publicitaria</Label>
              <select
                id="ad_account_id"
                name="ad_account_id"
                required
                className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                defaultValue=""
              >
                <option value="" disabled>
                  {adAccounts.length ? "Selecciona…" : "Valida el token primero"}
                </option>
                {adAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.account_id})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="page_id">Página de Facebook</Label>
              <select
                id="page_id"
                ref={pageSelectRef}
                name="page_id"
                required
                className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                defaultValue=""
              >
                <option value="" disabled>
                  {pages.length ? "Selecciona…" : "Valida el token primero"}
                </option>
                {pages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <p className="text-muted-foreground text-xs">
                Opcional: carga cuentas de Instagram vinculadas a la página
                seleccionada (usa el token y la página de arriba).
              </p>
              <Button
                type="button"
                variant="secondary"
                disabled={busyIg}
                onClick={() => {
                  const token = tokenSaveRef.current?.value;
                  const pageId = pageSelectRef.current?.value;
                  if (!token || !pageId) return;
                  igFetcher.submit(
                    {
                      intent: "load-ig-accounts",
                      access_token: token,
                      page_id: pageId,
                    },
                    { method: "post" },
                  );
                }}
              >
                {busyIg ? "Cargando…" : "Cargar Instagram"}
              </Button>
            </div>

            {igFetcher.data?.error ? (
              <p className="text-destructive text-sm">
                {igFetcher.data.message}
              </p>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="ig_account_id">Instagram (opcional)</Label>
              <select
                id="ig_account_id"
                name="ig_account_id"
                className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                defaultValue=""
              >
                <option value="">
                  {igAccounts.length
                    ? "Selecciona cuenta IG o ninguna"
                    : "Carga Instagram arriba o deja vacío"}
                </option>
                {igAccounts.map((ig) => (
                  <option key={ig.id} value={ig.id}>
                    @{ig.username ?? ig.id}
                  </option>
                ))}
              </select>
            </div>

            {saveActionData?.error ? (
              <p className="text-destructive text-sm">
                {saveActionData.message}
              </p>
            ) : null}
            {saveActionData && !saveActionData.error ? (
              <p className="text-muted-foreground text-sm">
                {saveActionData.message}
              </p>
            ) : null}

            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Guardando…" : "Guardar conexión"}
            </Button>
          </Form>

          {connection ? (
            <disconnectFetcher.Form method="post" className="border-t pt-4">
              <input type="hidden" name="intent" value="disconnect" />
              {disconnectFetcher.data?.error ? (
                <p className="text-destructive text-sm">
                  {disconnectFetcher.data.message}
                </p>
              ) : null}
              {disconnectFetcher.data && !disconnectFetcher.data.error ? (
                <p className="text-muted-foreground text-sm">
                  {disconnectFetcher.data.message}
                </p>
              ) : null}
              <Button
                type="submit"
                variant="destructive"
                disabled={busyDisconnect}
              >
                {busyDisconnect ? "Eliminando…" : "Desconectar Meta"}
              </Button>
            </disconnectFetcher.Form>
          ) : null}

          <Button asChild variant="outline">
            <Link to="/leader">Volver al panel</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
