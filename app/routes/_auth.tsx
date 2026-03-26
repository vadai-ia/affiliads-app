import { Outlet } from "react-router";
import type { Route } from "./+types/_auth";

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Algo salió mal</h1>
        <p className="mt-2 text-muted-foreground text-sm">
          {error instanceof Error ? error.message : "Error inesperado"}
        </p>
        <a
          href="/login"
          className="mt-4 inline-block text-sm text-primary underline"
        >
          Volver al inicio de sesión
        </a>
      </div>
    </div>
  );
}

export default function AuthLayout() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md">
        <Outlet />
      </div>
    </div>
  );
}
