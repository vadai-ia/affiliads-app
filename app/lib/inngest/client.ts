import { Inngest } from "inngest";

/**
 * Solo `INNGEST_ENV` explícito (sin inferir desde la signing key).
 * Inferir `prod` desde `signkey-prod-*` hacía que los eventos fueran a un
 * branch "prod" distinto del entorno Production por defecto → en el dashboard
 * el evento aparecía recibido pero "No functions triggered".
 * @see https://www.inngest.com/docs/sdk/environment-variables#inngest-env
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
