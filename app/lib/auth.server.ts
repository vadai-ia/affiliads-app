import { redirect } from "react-router";
import type { User } from "@supabase/supabase-js";
import type { UserRole } from "~/types/database";
import {
  createSupabaseServerClient,
  type SupabaseServerClient,
} from "~/lib/supabase.server";

export type AppUser = {
  id: string;
  email: string;
  orgId: string;
  role: UserRole;
  fullName: string | null;
};

export async function requireUser(
  request: Request,
): Promise<{ supabase: SupabaseServerClient; user: AppUser; headers: Headers }> {
  const { supabase, headers } = createSupabaseServerClient(request);
  const {
    data: { user: authUser },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !authUser) {
    throw redirect("/login", { headers });
  }

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("id, email, org_id, role, full_name, is_active")
    .eq("id", authUser.id)
    .maybeSingle();

  if (profileError || !profile || profile.is_active === false) {
    throw redirect("/login", { headers });
  }

  return {
    supabase,
    headers,
    user: {
      id: profile.id,
      email: profile.email,
      orgId: profile.org_id,
      role: profile.role as UserRole,
      fullName: profile.full_name,
    },
  };
}

export async function requireLeader(request: Request) {
  const ctx = await requireUser(request);
  if (ctx.user.role !== "leader") {
    throw redirect("/affiliate", { headers: ctx.headers });
  }
  return ctx;
}

export async function requireAffiliate(request: Request) {
  const ctx = await requireUser(request);
  if (ctx.user.role !== "affiliate") {
    throw redirect("/leader", { headers: ctx.headers });
  }
  return ctx;
}

/** Sesión sin perfil en DB (p.ej. justo tras callback) — devuelve auth user o redirect */
export async function requireAuthUser(
  request: Request,
): Promise<{ supabase: SupabaseServerClient; authUser: User; headers: Headers }> {
  const { supabase, headers } = createSupabaseServerClient(request);
  const {
    data: { user: authUser },
    error,
  } = await supabase.auth.getUser();
  if (error || !authUser) {
    throw redirect("/login", { headers });
  }
  return { supabase, authUser, headers };
}

export function redirectWithHeaders(
  to: string,
  base: Headers,
  init?: number,
) {
  const h = new Headers(base);
  return redirect(to, { headers: h, status: init });
}
