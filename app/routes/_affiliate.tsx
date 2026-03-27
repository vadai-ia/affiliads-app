import { data, Link, Outlet } from "react-router";
import { Button } from "~/components/ui/button";
import { NotificationsBell } from "~/components/notifications-bell";
import { requireAffiliate } from "~/lib/auth.server";
import type { Route } from "./+types/_affiliate";

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, user, headers } = await requireAffiliate(request);

  const [{ data: recent }, { count: unreadCount }] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, title, body, read, entity_type, entity_id, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("read", false),
  ]);

  return data(
    {
      unreadCount: unreadCount ?? 0,
      notifications: recent ?? [],
    },
    { headers },
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6">
      <h1 className="text-xl font-semibold">Error en panel de afiliado</h1>
      <p className="mt-2 text-muted-foreground text-sm">
        {error instanceof Error ? error.message : "Error inesperado"}
      </p>
      <Button asChild className="mt-4" variant="outline">
        <Link to="/affiliate">Volver</Link>
      </Button>
    </div>
  );
}

export default function AffiliateLayout({ loaderData }: Route.ComponentProps) {
  const { unreadCount, notifications } = loaderData;

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="border-b bg-card p-4 md:w-56 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between gap-2">
          <Link to="/affiliate" className="font-semibold">
            AfiliAds
          </Link>
          <NotificationsBell
            role="affiliate"
            unreadCount={unreadCount}
            notifications={notifications}
          />
        </div>
        <nav className="mt-6 flex flex-col gap-1 text-sm">
          <Link
            to="/affiliate/dashboard"
            className="rounded-md px-2 py-1.5 hover:bg-muted"
          >
            Inicio
          </Link>
          <Link
            to="/affiliate/campaigns"
            className="rounded-md px-2 py-1.5 hover:bg-muted"
          >
            Campañas
          </Link>
          <Link
            to="/affiliate/activations"
            className="rounded-md px-2 py-1.5 hover:bg-muted"
          >
            Mis activaciones
          </Link>
        </nav>
      </aside>
      <main className="flex-1 p-4 md:p-8">
        <Outlet />
      </main>
    </div>
  );
}
