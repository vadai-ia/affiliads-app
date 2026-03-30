/**
 * Debe cargarse ANTES que cualquier otro módulo del servidor (--import primero en NODE_OPTIONS).
 * En ESM los `import` se elevan; poner esto en instrument.server.mjs no garantizaba el orden.
 *
 * Inngest: sin RAILWAY_GIT_BRANCH el SDK no envía x-inngest-env → entorno Production por defecto.
 */
if (process.env.RAILWAY_ENVIRONMENT === "production") {
  delete process.env.RAILWAY_GIT_BRANCH;
}
