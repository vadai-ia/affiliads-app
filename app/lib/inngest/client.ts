import { Inngest } from "inngest";

/**
 * Entorno Inngest (`env` / `INNGEST_ENV` → header `x-inngest-env`).
 * Solo hace falta para [Branch Environments](https://www.inngest.com/docs/platform/environments#branch-environments).
 *
 * En Railway producción, `strip-railway-branch.mjs` (primer `--import` en `npm start`)
 * quita `RAILWAY_GIT_BRANCH`; si no, el SDK infiere branch (`main`) y desalinea eventos
 * vs funciones en el selector "Production" del dashboard.
 *
 * Si necesitas preview por rama, define `INNGEST_ENV` explícito (y no borres la rama en instrument).
 *
 * @see https://www.inngest.com/docs/reference/client/create
 */
function resolveInngestEnv(): string | undefined {
  const v = process.env.INNGEST_ENV?.trim();
  return v || undefined;
}

/** Cliente único de Inngest para eventos y registro de funciones. */
export const inngest = new Inngest({
  id: "afiliads",
  name: "AfiliAds",
  env: resolveInngestEnv(),
});
