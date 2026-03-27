# AfiliAds (app)

Remix-style app con **React Router v7** + **Supabase** + **Tailwind v4** + **shadcn/ui** (CLI `shadcn` en `devDependencies` solo para `@import "shadcn/tailwind.css"` en `app/app.css`).

## Requisitos

- Node 22+
- Proyecto Supabase con migraciones aplicadas (`supabase/migrations/` + MCP `apply_migration` en producción)

## Variables de entorno

Copia `.env.example` → `.env` y rellena. Nunca commitees `.env`.

| Variable | Uso |
|----------|-----|
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | Cliente SSR con cookies |
| `SUPABASE_SERVICE_ROLE_KEY` | Solo servidor: registro, invitaciones, admin Auth |
| `SITE_URL` | Base URL para `signInWithOtp` y `generateLink` (`/auth/callback`) |
| `SENTRY_DSN` | Servidor (`instrument.server.mjs`) |
| `VITE_SENTRY_DSN` | Cliente (mismo DSN suele valer) |
| `ENCRYPTION_KEY` | AES-256-GCM para tokens Meta en DB (`openssl rand -hex 32`) |
| `META_GRAPH_API_VERSION` | Opcional; default `v21.0` |
| `META_APP_ID` | Opcional; ID de la app en Meta (solo servidor) |
| `META_APP_SECRET` | Opcional; **nunca** en el cliente ni en `VITE_*` |
| `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` | Servidor: Inngest; sync URL `https://affiliads-app-production.up.railway.app/api/inngest` (misma base que `SITE_URL` en Railway) |

En **Supabase Dashboard → Authentication → URL configuration**:

- **Site URL**: tu `SITE_URL`
- **Redirect URLs**: `{SITE_URL}/auth/callback`

## Scripts (verificación estática; sin `npm run dev` en el pipeline interno del workspace)

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

CI en GitHub (`.github/workflows/ci.yml`) ejecuta los mismos pasos en cada push/PR a `main`.

Checklist manual post-deploy: [docs/QA_CHECKLIST_MVP.md](docs/QA_CHECKLIST_MVP.md).

`npm run dev` / `npm start` cargan Sentry vía `NODE_OPTIONS='--import ./instrument.server.mjs'`.

## Deploy (Railway + Supabase)

Guía paso a paso (URLs Auth, variables, healthcheck, CLI): **[DEPLOY.md](./DEPLOY.md)**.

Resumen:

1. En Supabase: **Site URL** + **Redirect URLs** con `/auth/callback`.
2. En Railway: conectar repo, copiar variables desde `.env.example`; `SITE_URL` = dominio Railway (`https://affiliads-app-production.up.railway.app`) hasta que tengas dominio propio.
3. `railway.toml` define health check en `GET /api/health`.
4. Push a `main` despliega si el proyecto está enlazado a GitHub.

## Cloudflare (DNS)

- CNAME del dominio → Railway.
- Proxy naranja, SSL full.
- Rate limit recomendado en `/login` (p.ej. 5 req/min/IP).

## Estructura relevante

- `app/routes/*` — rutas y layouts `_auth`, `_leader`, `_affiliate`
- `app/lib/supabase.server.ts` — cliente con cookies
- `app/lib/supabase.admin.server.ts` — service role (mutaciones sensibles)
- `app/lib/auth.server.ts` — `requireUser` / `requireLeader` / `requireAffiliate`
- `supabase/migrations/` — SQL de referencia (aplicado en prod via MCP)
