/**
 * Carga antes que el servidor (NODE_OPTIONS incluye strip-railway-branch.mjs antes que este archivo).
 * Inicializa Sentry en Node para que captureException / transacciones funcionen.
 */
import { init } from "@sentry/react-router";

const dsn = process.env.SENTRY_DSN;
if (dsn) {
  init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  });
}
