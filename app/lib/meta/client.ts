import { getMetaGraphApiVersion } from "~/lib/env.server";

const GRAPH_BASE = "https://graph.facebook.com";

export type MetaApiError = {
  code: number;
  message: string;
  subcode?: number;
  isRetryable: boolean;
  userTitle?: string;
  userMessage?: string;
  raw: unknown;
};

export function isMetaApiError(e: unknown): e is MetaApiError {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    "message" in e &&
    "isRetryable" in e &&
    typeof (e as MetaApiError).code === "number"
  );
}

export type MetaAdAccount = {
  id: string;
  name: string;
  account_id: string;
};

export type MetaPage = {
  id: string;
  name: string;
};

export type MetaInstagramAccount = {
  id: string;
  username?: string;
};

/** System User: `/me/adaccounts` suele ir vacío; hace falta listar por Business (`owned_*`). */
const REQUIRED_PERMISSIONS = [
  "ads_management",
  "ads_read",
  "pages_show_list",
  "pages_read_engagement",
  "business_management",
] as const;

function graphUrl(path: string, params: Record<string, string>): string {
  const v = getMetaGraphApiVersion();
  const base = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${GRAPH_BASE}/${v}${base}`);
  for (const [k, val] of Object.entries(params)) {
    url.searchParams.set(k, val);
  }
  return url.toString();
}

function isRetryableCode(code: number): boolean {
  return code === 17 || code === 1 || code === 2;
}

export function toMetaApiError(raw: unknown): MetaApiError {
  const r = raw as {
    error?: {
      code?: number;
      message?: string;
      error_subcode?: number;
      error_user_title?: string;
      error_user_msg?: string;
    };
  };
  const e = r?.error;
  const code = typeof e?.code === "number" ? e.code : -1;
  const message =
    typeof e?.message === "string" ? e.message : "Error desconocido de Meta API";
  const subcode =
    typeof e?.error_subcode === "number" ? e.error_subcode : undefined;
  const userTitle =
    typeof e?.error_user_title === "string" ? e.error_user_title : undefined;
  const userMessage =
    typeof e?.error_user_msg === "string" ? e.error_user_msg : undefined;
  return {
    code,
    message,
    subcode,
    isRetryable: isRetryableCode(code),
    userTitle,
    userMessage,
    raw,
  };
}

async function graphGet<T>(
  path: string,
  accessToken: string,
  extraParams: Record<string, string> = {},
): Promise<T> {
  const url = graphUrl(path, { access_token: accessToken, ...extraParams });
  const res = await fetch(url, { method: "GET" });
  const json = (await res.json()) as T & {
    error?: { code?: number; message?: string; error_subcode?: number };
  };
  if (!res.ok || json?.error) {
    throw toMetaApiError(json);
  }
  return json;
}

/**
 * Verifica token y permisos mínimos para Ads + Pages.
 */
export async function validateToken(accessToken: string): Promise<{
  userId: string;
  name?: string;
  granted: string[];
}> {
  const me = await graphGet<{ id: string; name?: string }>(
    "/me",
    accessToken,
    { fields: "id,name" },
  );
  const perms = await graphGet<{
    data?: { permission: string; status: string }[];
  }>("/me/permissions", accessToken, {});

  const granted = new Set<string>();
  for (const p of perms.data ?? []) {
    if (p.status === "granted") granted.add(p.permission);
  }
  const missing = REQUIRED_PERMISSIONS.filter((p) => !granted.has(p));
  if (missing.length > 0) {
    throw toMetaApiError({
      error: {
        code: 190,
        message: `Faltan permisos: ${missing.join(", ")}`,
      },
    });
  }
  return { userId: me.id, name: me.name, granted: [...granted] };
}

async function getAdAccountsFromMe(
  accessToken: string,
): Promise<MetaAdAccount[]> {
  const out = await graphGet<{
    data?: { id: string; name: string; account_id: string }[];
  }>("/me/adaccounts", accessToken, {
    fields: "id,name,account_id",
    limit: "100",
  });
  const rows = out.data ?? [];
  return rows.map((a) => ({
    id: a.id,
    name: a.name,
    account_id: a.account_id,
  }));
}

/**
 * Cuentas publicitarias del Business (imprescindible para muchos System User tokens).
 */
async function getAdAccountsFromBusinesses(
  accessToken: string,
): Promise<MetaAdAccount[]> {
  const businesses = await graphGet<{
    data?: { id: string; name?: string }[];
  }>("/me/businesses", accessToken, {
    fields: "id,name",
    limit: "50",
  });
  const byId = new Map<string, MetaAdAccount>();
  for (const b of businesses.data ?? []) {
    try {
      const owned = await graphGet<{
        data?: { id: string; name: string; account_id: string }[];
      }>(`/${b.id}/owned_ad_accounts`, accessToken, {
        fields: "id,name,account_id",
        limit: "100",
      });
      for (const a of owned.data ?? []) {
        if (!byId.has(a.id)) {
          byId.set(a.id, {
            id: a.id,
            name: a.name,
            account_id: a.account_id,
          });
        }
      }
    } catch {
      // Sin acceso a este business o sin cuentas; seguir con el resto
    }
  }
  return [...byId.values()];
}

export async function getAdAccounts(
  accessToken: string,
): Promise<MetaAdAccount[]> {
  const fromMe = await getAdAccountsFromMe(accessToken);
  if (fromMe.length > 0) return fromMe;
  return getAdAccountsFromBusinesses(accessToken);
}

async function getPagesFromMe(accessToken: string): Promise<MetaPage[]> {
  const out = await graphGet<{
    data?: { id: string; name: string }[];
  }>("/me/accounts", accessToken, {
    fields: "id,name",
    limit: "100",
  });
  return (out.data ?? []).map((p) => ({ id: p.id, name: p.name }));
}

/**
 * Páginas poseídas por el Business (System User suele no tener `/me/accounts`).
 */
async function getPagesFromBusinesses(
  accessToken: string,
): Promise<MetaPage[]> {
  const businesses = await graphGet<{
    data?: { id: string; name?: string }[];
  }>("/me/businesses", accessToken, {
    fields: "id,name",
    limit: "50",
  });
  const byId = new Map<string, MetaPage>();
  for (const b of businesses.data ?? []) {
    try {
      const owned = await graphGet<{
        data?: { id: string; name: string }[];
      }>(`/${b.id}/owned_pages`, accessToken, {
        fields: "id,name",
        limit: "100",
      });
      for (const p of owned.data ?? []) {
        if (!byId.has(p.id)) {
          byId.set(p.id, { id: p.id, name: p.name });
        }
      }
    } catch {
      try {
        const client = await graphGet<{
          data?: { id: string; name: string }[];
        }>(`/${b.id}/client_pages`, accessToken, {
          fields: "id,name",
          limit: "100",
        });
        for (const p of client.data ?? []) {
          if (!byId.has(p.id)) {
            byId.set(p.id, { id: p.id, name: p.name });
          }
        }
      } catch {
        // ignorar
      }
    }
  }
  return [...byId.values()];
}

export async function getPages(accessToken: string): Promise<MetaPage[]> {
  const fromMe = await getPagesFromMe(accessToken);
  if (fromMe.length > 0) return fromMe;
  return getPagesFromBusinesses(accessToken);
}

/**
 * Cuenta de Instagram Business vinculada a la página (si existe).
 */
export async function getIGAccounts(
  accessToken: string,
  pageId: string,
): Promise<MetaInstagramAccount[]> {
  const page = await graphGet<{
    instagram_business_account?: { id: string; username?: string };
  }>(`/${pageId}`, accessToken, {
    fields: "instagram_business_account{id,username}",
  });
  const ig = page.instagram_business_account;
  if (!ig?.id) return [];
  return [{ id: ig.id, username: ig.username }];
}
