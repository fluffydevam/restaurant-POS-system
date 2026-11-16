# Deployment

The platform deploys as two pieces:

| Piece | Host | Root directory |
|---|---|---|
| React SPA | Vercel | `apps/web` |
| Laravel API | Render (free plan) | `apps/api` |
| PostgreSQL + Storage | Supabase | — |

## 1. Vercel (web)

### Option A — Git integration (recommended)

1. Push the repository to GitHub.
2. In Vercel, **Add New → Project** and import `fluffydevam/restaurant-POS-system`.
3. Set **Root Directory** to `apps/web`.
4. Framework preset: **Vite**. Build command `npm run build`, output `dist`.
5. Add environment variables (see below) for Production, Preview, and Development.
6. Deploy. Every push to `main` redeploys production; pull requests get preview URLs.

### Option B — CLI

```bash
cd apps/web
npx vercel link --project restaurant-pos-web
npx vercel env add VITE_API_URL production
npx vercel deploy --prod
```

`apps/web/vercel.json` already sets the framework, build command, output directory, and
the SPA fallback rewrite.

### Environment variables

| Variable | Value | Notes |
|---|---|---|
| `VITE_API_URL` | `https://api.yourdomain.com` | No trailing slash. Omit only for local proxy development. |

Everything prefixed with `VITE_` is embedded in the browser bundle. Never put database
credentials, `APP_KEY`, or Supabase service keys in Vercel.

### Without a deployed API

If `VITE_API_URL` is unset, the SPA calls `/api/v1/*` on its own origin. The SPA fallback
rewrite then returns `index.html`, so login will fail. Deploy the API first, or set
`VITE_API_URL` as soon as the API has a public URL and redeploy.

## 2. Render (API)

The API runs as a Docker web service on Render's **free plan**: 512 MB RAM, 0.1 CPU, no card
required, and no expiry. The trade-offs:

- It spins down after 15 minutes without traffic and takes roughly a minute to wake.
- One free service per workspace with 750 instance hours per month (enough for a single service).
- No background workers, cron jobs, persistent disk, or custom domains.
- Outbound SMTP ports are blocked, so email must go through an HTTP API (Resend, Postmark,
  Mailgun) rather than SMTP.

### Blueprint deploy

`render.yaml` in the repository root defines the service (`rootDir: apps/api`, Docker, free plan,
health check `/up`). To create it:

1. Push to GitHub.
2. In Render, **New → Blueprint**, select `fluffydevam/restaurant-POS-system`.
3. When prompted, enter the two secret values:
   - `APP_KEY` — generate with `php artisan key:generate --show`.
   - `DB_URL` — the Supabase **session pooler** URI.
4. Apply. Render builds `apps/api/Dockerfile` and serves the API at
   `https://restaurant-pos-api.onrender.com`.

`config/app.php` falls back to Render's `RENDER_EXTERNAL_URL` when `APP_URL` is unset, so signed
email-verification URLs are correct without extra configuration.

Because free services cannot run one-off jobs, run migrations from a machine with PHP installed,
pointing at the production database:

```bash
cd apps/api
DB_URL="postgresql://..." php artisan migrate --force
```

### Before/after deploy notes

- The container caches config and views at start (`AUTORUN_*` env vars in the Dockerfile), after
  Render injects the environment variables.
- Route caching stays off: `routes/web.php` uses a closure, which cannot be serialised.
- `QUEUE_CONNECTION=sync` because there is no worker on the free plan. Move to `database` plus a
  paid worker service when background jobs are introduced.

### Railway (alternative, not free)

Railway is usage-based. The 30-day trial includes $5 of credit, then a permanent Free plan gives
about $1 of credit per month, which does not cover an always-on container; the practical floor is
the $5/month Hobby plan. `apps/api/railway.json` is kept for that case:

```bash
cd apps/api
npx --yes @railway/cli login
npx --yes @railway/cli init --name restaurant-pos-api
npx --yes @railway/cli up --detach
```

### Environment variables (API)

```env
APP_NAME="Restaurant POS"
APP_ENV=production
APP_DEBUG=false
APP_KEY=base64:...
APP_URL=https://restaurant-pos-api.onrender.com   # optional, RENDER_EXTERNAL_URL is used otherwise
FRONTEND_URL=https://restaurant-pos-web-five.vercel.app

DB_CONNECTION=pgsql
DB_URL="postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require"

SESSION_DRIVER=cookie
CACHE_STORE=database
QUEUE_CONNECTION=sync

LOG_CHANNEL=stderr
LOG_LEVEL=info
MAIL_MAILER=log
```

## 3. Supabase

- Use the **session pooler** hostname (IPv4) for the API and workers.
- Run migrations from CI or a release command, never on container boot.
- Create a Storage bucket and S3 access keys, then set the `AWS_*` variables for production.
- Use separate projects for staging and production. The free tier pauses after inactivity
  and has no point-in-time recovery.

## 4. CORS and domains

- `FRONTEND_URL` on the API must exactly match the deployed web origin (scheme + host).
- Multiple origins can be comma-separated in `FRONTEND_URL`.
- Suggested custom domains: `pos.yourdomain.com` (Vercel). Render's free plan has no custom
  domains; use the `onrender.com` URL for the API.
- Redeploy the SPA after changing `VITE_API_URL`, because Vite embeds it at build time.

## 5. Smoke test

1. `GET https://restaurant-pos-api.onrender.com/up` returns `200`.
2. `POST https://restaurant-pos-api.onrender.com/api/v1/auth/login` with the demo account returns a token.
3. The Vercel URL loads the login page with no CORS errors in the console.
4. Logging in as an active tenant lands on the dashboard.
5. Registering a new restaurant lands on the pending-approval screen.

## 6. Before real users

- [ ] Rotate the Supabase database password and store it only in Render.
- [ ] `APP_DEBUG=false`, `APP_ENV=production`.
- [ ] Configure a transactional email provider (Resend/Postmark) and verify the sending domain.
- [ ] Add Sentry (API + web).
- [ ] Enable Supabase Pro, backups, and a `pg_dump` job.
- [ ] Build the platform-admin approval queue before opening signup publicly.
