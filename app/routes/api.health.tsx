import { data } from "react-router";
import { createSupabaseServerClient } from "~/lib/supabase.server";
import type { Route } from "./+types/api.health";

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request);
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
}
