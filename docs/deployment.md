# Deployment

The platform deploys as two pieces:

| Piece | Host | Root directory |
|---|---|---|
| React SPA | Vercel | `apps/web` |
| Laravel API + workers | Railway (or any PHP host) | `apps/api` |
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

## 2. Railway (API)

1. Create a Railway project and add a service from the GitHub repository.
2. Set the service **Root Directory** to `apps/api`.
3. Add the environment variables below.
4. Add two more services from the same repository/image:
   - Worker: `php artisan queue:work --tries=3 --max-time=3600`
   - Scheduler: `php artisan schedule:work`
5. Set the release command to `php artisan migrate --force`.

Use a Dockerfile (PHP 8.3 FPM + nginx + supervisor) for reproducible builds and to pin
`pdo_pgsql`, `pgsql`, `intl`, and `gd`. Nixpacks can work, but requires the same extensions.

### Environment variables (API)

```env
APP_NAME="Restaurant POS"
APP_ENV=production
APP_DEBUG=false
APP_KEY=base64:...
APP_URL=https://api.yourdomain.com
FRONTEND_URL=https://pos.yourdomain.com

DB_CONNECTION=pgsql
DB_URL="postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require"

SESSION_DRIVER=cookie
CACHE_STORE=database
QUEUE_CONNECTION=database

MAIL_MAILER=...
MAIL_FROM_ADDRESS=...
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
- Suggested custom domains: `pos.yourdomain.com` (Vercel) and `api.yourdomain.com` (Railway).
- Redeploy the SPA after changing `VITE_API_URL`, because Vite embeds it at build time.

## 5. Smoke test

1. `GET https://api.yourdomain.com/up` returns `200`.
2. `POST https://api.yourdomain.com/api/v1/auth/login` with the demo account returns a token.
3. The Vercel URL loads the login page with no CORS errors in the console.
4. Logging in as an active tenant lands on the dashboard.
5. Registering a new restaurant lands on the pending-approval screen.

## 6. Before real users

- [ ] Rotate the Supabase database password and store it only in Railway.
- [ ] `APP_DEBUG=false`, `APP_ENV=production`.
- [ ] Configure a transactional email provider (Resend/Postmark) and verify the sending domain.
- [ ] Add Sentry (API + web).
- [ ] Enable Supabase Pro, backups, and a `pg_dump` job.
- [ ] Build the platform-admin approval queue before opening signup publicly.
