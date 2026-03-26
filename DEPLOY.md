# Deploy producción: Supabase + Railway

Estado **DB**: las migraciones ya están aplicadas en el proyecto Supabase vinculado al MCP (`initial_schema_*`). Verifica en **Supabase → Database → Migrations** si hace falta.

---

## 1. Supabase (Dashboard)

### Auth — URLs obligatorias

En **Authentication → URL configuration**:

| Campo | Valor |
|--------|--------|
| **Site URL** | La URL pública final de la app, p. ej. `https://app.afiliads.com` (sin slash final) |
| **Redirect URLs** | Añade exactamente: `https://TU-DOMINIO/auth/callback` |

Si usas el dominio temporal de Railway primero, añade también  
`https://TU-SERVICIO.up.railway.app/auth/callback` y luego la URL definitiva.

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
| `SITE_URL` | URL pública **HTTPS** (la misma que Site URL en Supabase Auth) |
| `NODE_ENV` | `production` |
| `SENTRY_DSN` | Opcional (servidor + `instrument.server.mjs`) |
| `VITE_SENTRY_DSN` | Opcional; **debe existir en el build** si quieres Sentry en el cliente (Vite inyecta en compile time) |

Railway inyecta `PORT`; `npm start` ya usa `react-router-serve` y respeta el puerto.

### Build / Start

Por defecto Nixpacks ejecuta `npm install` / `npm run build` y el **Start** del `package.json`:

- `start` = `NODE_OPTIONS='--import ./instrument.server.mjs' react-router-serve ./build/server/index.js`

No hace falta comando custom si el repo tiene `package.json` como está.

### Health check

`railway.toml` define `healthcheckPath = "/api/health"`. El loader comprueba conexión a Supabase; si las env vars son incorrectas, responderá 503 (correcto para “no saludable”).

---

## 3. Verificación post-deploy

```bash
curl -sS "https://TU-DOMINIO/api/health"
```

Esperado: JSON con `"status":"ok"` y `timestamp`.

Luego: registro líder → invitación → enlace `/invite/...` → magic link → callback.

---

## 4. Cloudflare (opcional)

CNAME al dominio Railway, proxy activado, SSL Full, rate limit en `/login` (p. ej. 5 req/min por IP).
