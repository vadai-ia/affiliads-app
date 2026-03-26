import { createServerClient } from "@supabase/ssr";
import { parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "~/types/database";
import { getSupabaseServerEnv } from "~/lib/env.server";

export type SupabaseServerClient = SupabaseClient<Database>;

export function createSupabaseServerClient(request: Request): {
  supabase: SupabaseServerClient;
  headers: Headers;
} {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = getSupabaseServerEnv();
  const headers = new Headers();

  const supabase = createServerClient<Database>(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return parseCookieHeader(request.headers.get("Cookie") ?? "").map(
            (c) => ({
              name: c.name,
              value: c.value ?? "",
            }),
          );
        },
        setAll(cookiesToSet) {
          for (const cookie of cookiesToSet) {
            headers.append(
              "Set-Cookie",
              serializeCookieHeader(
                cookie.name,
                cookie.value,
                cookie.options,
              ),
            );
          }
        },
      },
    },
  );

  return { supabase, headers };
}

export function mergeHeaders(
  base: Headers,
  extra: Headers,
): Headers {
  const out = new Headers(base);
  extra.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") {
      out.append(key, value);
    } else {
      out.set(key, value);
    }
  });
  return out;
}
