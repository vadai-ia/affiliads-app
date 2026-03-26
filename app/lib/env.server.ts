function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export function getPublicEnv() {
  return {
    SUPABASE_URL: process.env.SUPABASE_URL ?? "",
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? "",
    SENTRY_DSN: process.env.SENTRY_DSN ?? "",
  };
}

/** URL + anon para loaders/actions con cookie session */
export function getSupabaseServerEnv() {
  return {
    SUPABASE_URL: required("SUPABASE_URL"),
    SUPABASE_ANON_KEY: required("SUPABASE_ANON_KEY"),
  };
}

export function getSiteUrl() {
  return process.env.SITE_URL ?? "http://localhost:5173";
}

/** Incluye service role (solo rutas server que lo necesiten) */
export function getServerEnv() {
  return {
    ...getSupabaseServerEnv(),
    SUPABASE_SERVICE_ROLE_KEY: required("SUPABASE_SERVICE_ROLE_KEY"),
    SITE_URL: getSiteUrl(),
    SENTRY_DSN: process.env.SENTRY_DSN,
  };
}

/** Graph API version (Marketing API). Default v21.0 */
export function getMetaGraphApiVersion(): string {
  return process.env.META_GRAPH_API_VERSION?.trim() || "v21.0";
}

/**
 * Credenciales de la Meta App (solo servidor). Opcionales: hoy el flujo usa el
 * token que el líder pega en UI; sirven para debug_token / flujos futuros.
 */
export function getMetaAppId(): string | undefined {
  return process.env.META_APP_ID?.trim() || undefined;
}

export function getMetaAppSecret(): string | undefined {
  return process.env.META_APP_SECRET?.trim() || undefined;
}

/**
 * Clave AES-256 (32 bytes) en hex (64 caracteres).
 * Solo requerida al cifrar/descifrar tokens Meta (p. ej. guardar conexión).
 */
export function getEncryptionKeyHex(): string {
  const hex = required("ENCRYPTION_KEY");
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(
      "ENCRYPTION_KEY must be 64 hex characters (32 bytes) for AES-256-GCM",
    );
  }
  return hex.toLowerCase();
}

/** Rotación opcional: versión 2 */
export function getEncryptionKeyHexForVersion(version: number): string {
  if (version === 1) return getEncryptionKeyHex();
  if (version === 2) {
    const v2 = process.env.ENCRYPTION_KEY_V2;
    if (!v2) throw new Error("Missing ENCRYPTION_KEY_V2 for encryption key version 2");
    if (!/^[0-9a-fA-F]{64}$/.test(v2)) {
      throw new Error("ENCRYPTION_KEY_V2 must be 64 hex characters");
    }
    return v2.toLowerCase();
  }
  throw new Error(`Unsupported encryption key version: ${version}`);
}
