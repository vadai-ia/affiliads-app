import { data } from "react-router";
import { getSupabaseAdmin } from "~/lib/supabase.admin.server";
import type { Route } from "./+types/api.health";

/** Railway healthcheck no envía cookies; el anon + RLS fallaría siempre. Service role solo servidor. */
export async function loader(_args: Route.LoaderArgs) {
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("organizations").select("id").limit(1);
    if (error) {
      return data(
        {
          status: "error" as const,
          timestamp: new Date().toISOString(),
          detail: error.message,
        },
        { status: 503 },
      );
    }
    return data({
      status: "ok" as const,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return data(
      {
        status: "error" as const,
        timestamp: new Date().toISOString(),
        detail,
      },
      { status: 503 },
    );
  }
}
