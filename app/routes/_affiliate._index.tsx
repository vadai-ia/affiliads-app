import { requireAffiliate } from "~/lib/auth.server";
import type { Route } from "./+types/_affiliate._index";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAffiliate(request);
  return null;
}

export default function AffiliateDashboard() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Panel de afiliado</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Aquí verás tus campañas cuando estén disponibles (Fase 1+).
      </p>
    </div>
  );
}
