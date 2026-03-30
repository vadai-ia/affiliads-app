import { Inngest } from "inngest";

/**
 * Entorno Inngest (header `x-inngest-env`). Debe coincidir con el selector del
 * dashboard (mismo valor con el que se sincronizan las funciones vía `/api/inngest`).
 *
 * - `INNGEST_ENV` en Railway si quieres un valor explícito (recomendado en prod).
 * - Sin `INNGEST_ENV`, el SDK infiere `RAILWAY_GIT_BRANCH` (p. ej. `main`) en Railway
 *   → entorno **branch**, no Production → eventos recibidos pero "No functions triggered"
 *   si las funciones están en Production.
 * - En servicio Railway `production` forzamos `production` para alinear con el
 *   entorno Production por defecto de Inngest Cloud (sobrescribe con `INNGEST_ENV`).
 *
 * @see https://www.inngest.com/docs/platform/environments#configuring-branch-environments
 * @see https://www.inngest.com/docs/sdk/environment-variables#inngest-env
 */
function resolveInngestEnv(): string | undefined {
  const v = process.env.INNGEST_ENV?.trim();
  if (v) return v;
  if (process.env.RAILWAY_ENVIRONMENT === "production") {
    return "production";
  }
  return undefined;
}

/** Cliente único de Inngest para eventos y registro de funciones. */
export const inngest = new Inngest({
  id: "afiliads",
  name: "AfiliAds",
  env: resolveInngestEnv(),
});
