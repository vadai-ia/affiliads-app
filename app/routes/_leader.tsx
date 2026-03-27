import { Link, Outlet } from "react-router";
import { Bell } from "lucide-react";
import { Button } from "~/components/ui/button";
import { requireLeader } from "~/lib/auth.server";
import type { Route } from "./+types/_leader";

export async function loader({ request }: Route.LoaderArgs) {
  await requireLeader(request);
  return null;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6">
      <h1 className="text-xl font-semibold">Error en panel de líder</h1>
      <p className="mt-2 text-muted-foreground text-sm">
        {error instanceof Error ? error.message : "Error inesperado"}
      </p>
      <Button asChild className="mt-4" variant="outline">
        <Link to="/leader">Volver</Link>
      </Button>
    </div>
  );
}

export default function LeaderLayout() {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="border-b bg-card p-4 md:w-56 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between gap-2">
          <Link to="/leader" className="font-semibold">
            AfiliAds
          </Link>
          <Button variant="ghost" size="icon" type="button" aria-label="Notificaciones">
            <Bell className="size-4" />
          </Button>
        </div>
        <nav className="mt-6 flex flex-col gap-1 text-sm">
          <Link
            to="/leader"
            className="rounded-md px-2 py-1.5 hover:bg-muted"
          >
            Inicio
          </Link>
          <Link
            to="/leader/activations"
            className="rounded-md px-2 py-1.5 hover:bg-muted"
          >
            Solicitudes
          </Link>
          <Link
            to="/leader/metrics"
            className="rounded-md px-2 py-1.5 hover:bg-muted"
          >
            Métricas
          </Link>
          <Link
            to="/leader/templates"
            className="rounded-md px-2 py-1.5 hover:bg-muted"
          >
            Templates
          </Link>
          <Link
            to="/leader/affiliates"
            className="rounded-md px-2 py-1.5 hover:bg-muted"
          >
            Afiliados
          </Link>
          <Link
            to="/leader/settings/bank"
            className="rounded-md px-2 py-1.5 hover:bg-muted"
          >
            Datos bancarios
          </Link>
          <Link
            to="/leader/settings/meta"
            className="rounded-md px-2 py-1.5 hover:bg-muted"
          >
            Meta Ads
          </Link>
        </nav>
      </aside>
      <main className="flex-1 p-4 md:p-8">
        <Outlet />
      </main>
    </div>
  );
}
