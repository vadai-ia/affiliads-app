# Deploy producción: Supabase + Railway

Estado **DB**: las migraciones ya están aplicadas en el proyecto Supabase vinculado al MCP (`initial_schema_*`). Verifica en **Supabase → Database → Migrations** si hace falta.

---

## 1. Supabase (Dashboard)

### Auth — URLs obligatorias

En **Authentication → URL configuration** (debe coincidir con `SITE_URL` en Railway):

| Campo | Valor (MVP con dominio Railway) |
|--------|--------|
| **Site URL** | `https://affiliads-app-production.up.railway.app` (sin slash final) |
| **Redirect URLs** | `https://affiliads-app-production.up.railway.app/auth/callback` |

Cuando pases a dominio propio (p. ej. Cloudflare → `https://app.afiliads.com`), cambia **Site URL**, añade el nuevo `/auth/callback` en **Redirect URLs** y actualiza `SITE_URL` en Railway.

### API keys

En **Project Settings → API**:

- **Project URL** → `SUPABASE_URL`
- **anon public** → `SUPABASE_ANON_KEY`
- **service_role** → `SUPABASE_SERVICE_ROLE_KEY` (solo servidor Railway; nunca en el cliente ni en `VITE_*`)

---

## 2. Railway

### Conectar el repo

1. **New project → Deploy from GitHub** y elige el repo cuyo **root** es esta carpeta (`afiliads-app` como raíz del repo, o define **Root Directory** = `afiliads-app` si el monorepo vive arriba).
2. Instala la CLI y enlaza (en tu máquina, con sesión iniciada):

   ```bash
   cd afiliads-app
   railway login
   railway link
   ```

Si el MCP de Railway devuelve “Not logged in”, los pasos anteriores son la vía correcta; el token del MCP no sustituye `railway login` en tu entorno local.

### Variables de entorno (servicio)

Configura **todas** estas variables en el servicio (mismo nombre que en `.env.example`):

| Variable | Notas |
|----------|--------|
| `SUPABASE_URL` | URL del proyecto |
| `SUPABASE_ANON_KEY` | anon |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role |
| `SITE_URL` | Por defecto `https://affiliads-app-production.up.railway.app` (misma que Site URL en Supabase Auth) |
| `NODE_ENV` | `production` |
| `SENTRY_DSN` | Opcional (servidor + `instrument.server.mjs`) |
| `VITE_SENTRY_DSN` | Opcional; **debe existir en el build** si quieres Sentry en el cliente (Vite inyecta en compile time) |
| `ENCRYPTION_KEY` | **Obligatorio** para guardar conexión Meta (hex 64 chars = 32 bytes; `openssl rand -hex 32`) |
| `META_GRAPH_API_VERSION` | Opcional; default `v21.0` |
| `META_APP_ID` | Opcional; ID de la app Meta (solo servidor) |
| `META_APP_SECRET` | Opcional; **solo** Railway/servidor, nunca en build cliente |
| `INNGEST_EVENT_KEY` | Para enviar eventos (`campaign/create`) al aprobar pagos |
| `INNGEST_SIGNING_KEY` | Para que Inngest Cloud invoque de forma segura `GET/POST /api/inngest` |

En el dashboard de Inngest, la URL de sync debe ser la misma base que `SITE_URL` (Railway), p. ej. `https://affiliads-app-production.up.railway.app/api/inngest` (cambia el host si tu servicio tiene otro dominio).

Railway inyecta `PORT`; `npm start` ya usa `react-router-serve` y respeta el puerto.

### Build / Start

Por defecto Nixpacks ejecuta `npm install` / `npm run build` y el **Start** del `package.json`:

- `start` = `NODE_OPTIONS='--import ./instrument.server.mjs' react-router-serve ./build/server/index.js`

No hace falta comando custom si el repo tiene `package.json` como está.

### Health check

`railway.toml` define `healthcheckPath = "/api/health"`. El loader hace un `select` mínimo con **service role** (solo servidor): el healthcheck de Railway no envía cookies, así que anon + RLS no serviría. Si faltan credenciales o la DB no responde, 503 (correcto para “no saludable”).

---

## 3. Verificación post-deploy

```bash
curl -sS "https://affiliads-app-production.up.railway.app/api/health"
```

Esperado: JSON con `"status":"pass"`, `service`, `version`, `uptime`, `timestamp` y `checks.database`.

Luego: registro líder → invitación → enlace `/invite/...` → magic link → callback.

---

## 4. Resend (dominio y entregabilidad)

1. En [Resend → Domains](https://resend.com/domains) añade el dominio (p. ej. `affilia.vadai.com.mx`).
2. Añade en tu DNS los registros que Resend muestra (SPF, DKIM; a veces un registro de verificación).
3. Espera **Verified** antes de confiar en producción: sin dominio verificado, Resend puede rechazar o limitar envíos según el remitente.
4. `EMAIL_FROM` en Railway debe usar una dirección de ese dominio verificado (formato `Nombre <correo@dominio>` o solo el email).

Mientras uses solo la URL de prueba de Railway, el dominio sigue siendo obligatorio para el remitente que configuraste en Resend.

---

## 5. Cloudflare (opcional, cuando tengas dominio propio)

CNAME al dominio Railway, proxy activado, SSL Full, rate limit en `/login` (p. ej. 5 req/min por IP).

---

## CI (GitHub Actions)

En el repo con raíz `afiliads-app`, el workflow `.github/workflows/ci.yml` ejecuta en cada push/PR a `main`: `typecheck`, `lint`, `test`, `build`.
