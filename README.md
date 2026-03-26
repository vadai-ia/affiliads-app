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

En **Supabase Dashboard → Authentication → URL configuration**:

- **Site URL**: tu `SITE_URL`
- **Redirect URLs**: `{SITE_URL}/auth/callback`

## Scripts (verificación estática; sin `npm run dev` en el pipeline interno del workspace)

```bash
npm run typecheck
npm run lint
npm run build
```

`npm run dev` / `npm start` cargan Sentry vía `NODE_OPTIONS='--import ./instrument.server.mjs'`.

## Deploy (Railway)

1. Repo conectado a GitHub; push a `main` despliega.
2. Variables: las de `.env.example` (producción).
3. **Start command** (o dejar default si `package.json` ya define `start`): debe incluir `NODE_OPTIONS` como en `package.json`.
4. Health check HTTP: `GET /api/health`

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
