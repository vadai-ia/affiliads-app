import { redirect } from "react-router";
import { createSupabaseServerClient } from "~/lib/supabase.server";
import type { Route } from "./+types/_auth.callback";

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, headers } = createSupabaseServerClient(request);
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      throw redirect("/login?error=callback", { headers });
    }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw redirect("/login", { headers });
  }

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    throw redirect("/login?error=no_profile", { headers });
  }

  if (profile.role === "leader") {
    throw redirect("/leader", { headers });
  }
  if (profile.role === "affiliate") {
    throw redirect("/affiliate", { headers });
  }

  throw redirect("/login", { headers });
}
