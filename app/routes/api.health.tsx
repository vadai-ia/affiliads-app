import { data } from "react-router";
import { healthPayload } from "~/lib/health.server";
import { getSupabaseAdmin } from "~/lib/supabase.admin.server";
import type { Route } from "./+types/api.health";

/** Railway healthcheck no envía cookies; el anon + RLS fallaría siempre. Service role solo servidor. */
export async function loader(_args: Route.LoaderArgs) {
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("organizations").select("id").limit(1);
    if (error) {
      return data(
        healthPayload("fail", {
          detail: error.message,
          checks: { database: "fail" },
        }),
        { status: 503 },
      );
    }
    return data(
      healthPayload("pass", { checks: { database: "pass" } }),
      { status: 200 },
    );
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return data(
      healthPayload("fail", {
        detail,
        checks: { database: "fail" },
      }),
      { status: 503 },
    );
  }
}
