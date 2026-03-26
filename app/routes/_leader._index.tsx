import { requireLeader } from "~/lib/auth.server";
import type { Route } from "./+types/_leader._index";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Link } from "react-router";

export async function loader({ request }: Route.LoaderArgs) {
  await requireLeader(request);
  return null;
}

export default function LeaderDashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Panel de líder</h1>
        <p className="text-muted-foreground text-sm">
          Invita afiliados y gestiona tu organización.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Siguiente paso</CardTitle>
          <CardDescription>
            Invita a tu primer afiliado para probar el flujo completo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            to="/leader/affiliates"
            className="text-primary text-sm font-medium underline"
          >
            Ir a Afiliados
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
