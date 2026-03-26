import { Link, Outlet } from "react-router";
import { Bell } from "lucide-react";
import { Button } from "~/components/ui/button";
import { requireAffiliate } from "~/lib/auth.server";
import type { Route } from "./+types/_affiliate";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAffiliate(request);
  return null;
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

export default function AffiliateLayout() {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="border-b bg-card p-4 md:w-56 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between gap-2">
          <Link to="/affiliate" className="font-semibold">
            AfiliAds
          </Link>
          <Button variant="ghost" size="icon" type="button" aria-label="Notificaciones">
            <Bell className="size-4" />
          </Button>
        </div>
        <nav className="mt-6 flex flex-col gap-1 text-sm">
          <Link
            to="/affiliate"
            className="rounded-md px-2 py-1.5 hover:bg-muted"
          >
            Inicio
          </Link>
        </nav>
      </aside>
      <main className="flex-1 p-4 md:p-8">
        <Outlet />
      </main>
    </div>
  );
}
