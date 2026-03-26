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
