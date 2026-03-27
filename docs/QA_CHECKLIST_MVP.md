# QA checklist MVP (post–gaps)

Checklist manual tras cerrar infra (Sentry server, CI, tests, Railway). No sustituye pruebas con usuarios reales.

## Automatizado en CI

- `npm run typecheck` — TypeScript + route typegen
- `npm run lint` — ESLint
- `npm run test` — Vitest (crypto roundtrip, CPL/insights, budget parse, template Zod)
- `npm run build` — build producción React Router

## Entorno Railway

- [ ] `SENTRY_DSN` y `VITE_SENTRY_DSN` presentes (mismo proyecto Sentry suele bastar)
- [ ] `SITE_URL` coincide con Supabase Auth Site URL y con la URL pública real (Railway `.railway.app` o custom)
- [ ] Health: `GET /api/health` → `status: "pass"` (ver `DEPLOY.md`)
- [ ] `railway.toml` en repo con `healthcheckPath = "/api/health"` (deploys nuevos lo respetan)

## Resend

- [ ] Dominio verificado en Resend + DNS aplicado (`DEPLOY.md` §4)
- [ ] Enviar un email de prueba (p. ej. flujo de invitación o notificación) y confirmar recepción

## Sentry

- [ ] Forzar un error 500 en staging o revisar que un error real aparece en el proyecto Sentry (servidor y, si aplica, cliente con `VITE_SENTRY_DSN`)

## Flujos críticos (manual)

- [ ] Registro líder → login magic link → dashboard líder
- [ ] Invitar afiliado → enlace `/invite/:token` → registro → rol affiliate
- [ ] **Invitaciones expiradas**: el loader/action de `_auth.invite.$token` redirige si `expires_at < now()` — confirmar en Supabase que `expires_at` se rellena (default/trigger, p. ej. +7 días) al insertar en `invitation_tokens`
- [ ] **Doble submit**: formularios con `useNavigation` / `useFetcher` deshabilitan botón mientras `state !== "idle"` en rutas críticas (activación, aprobación, templates)
- [ ] **Responsive**: revisar al menos dashboard afiliado y activación en viewport móvil (375px)

## Seguridad rápida

- [ ] No hay tokens Meta ni service role en respuestas de loaders al cliente (Network tab)
- [ ] `.env` no commiteado; secretos solo en Railway
