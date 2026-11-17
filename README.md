# Restaurant POS

A multi-tenant, free-forever restaurant POS platform. Anyone can apply for a restaurant
account; applications are approved manually before the workspace is unlocked.

- **Web (production):** https://restaurant-pos-web-five.vercel.app
- **API (production):** https://restaurant-pos-api-o7kw.onrender.com (free plan, cold starts after idle)

## Stack

| Layer | Choice |
|---|---|
| API | Laravel 12 (PHP 8.2+), Sanctum tokens |
| Web | React 19 + Vite + TypeScript + Tailwind v4 |
| Database | PostgreSQL (Supabase, session pooler) |
| API hosting | Render (free Docker web service) |
| Web hosting | Vercel |
| Storage | Supabase Storage (S3 API) |

## Repository layout

```
apps/
  api/      Laravel 12 API
  web/      React SPA
docker-compose.yml   Local Postgres 16 (optional)
```

## Local development

### API

```bash
cd apps/api
composer install
cp .env.example .env
php artisan key:generate
```

Set `DB_URL` in `apps/api/.env` to the Supabase **session pooler** URI:

```env
DB_CONNECTION=pgsql
DB_URL="postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require"
```

Then:

```bash
php artisan migrate --seed
php artisan serve --port=8001
```

The API is expected at `http://localhost:8001` because the Vite dev proxy targets that port.
If you prefer Docker for local Postgres, run `docker compose up -d` from the repository root and
point `DB_URL` at it instead.

Demo accounts (created by the seeders):

```
owner@demo.test   / password   # owner of Demo Restaurant (active)
admin@demo.test   / password   # platform admin, no restaurant membership
pending@demo.test / secret123  # owner of Pending Cafe (waiting for approval)
```

The platform admin signs in and lands on `/admin`, the approval queue.

### Web

```bash
cd apps/web
npm install
npm run dev
```

Open `http://localhost:5173`. Requests to `/api` are proxied to the API on port 8001. For a
deployed environment, set `VITE_API_URL` to the public API origin; leave it empty locally.

## Tests

```bash
cd apps/api
php artisan test
```

Tests run against in-memory SQLite (`phpunit.xml`) so they never touch the Supabase database.

## API surface (v1)

| Method | Path | Notes |
|---|---|---|
| POST | `/api/v1/auth/register` | Creates a user + `pending_approval` tenant + owner membership |
| POST | `/api/v1/auth/login` | Returns a Sanctum bearer token |
| POST | `/api/v1/auth/logout` | Revokes the current token |
| GET | `/api/v1/auth/email/verify/{id}/{hash}` | Signed email verification link |
| POST | `/api/v1/auth/email/verification-notification` | Resend verification |
| GET | `/api/v1/me` | Current user + memberships |
| GET | `/api/v1/tenant` | Requires `Authorization` and `X-Tenant-Id` |
| GET | `/api/v1/admin/stats` | Platform admin only: tenant counts by status |
| GET | `/api/v1/admin/tenants` | Platform admin only: `status`, `search`, `page` filters |
| POST | `/api/v1/admin/tenants/{id}/approve` | Activates the tenant, provisions a default branch, emails the owner |
| POST | `/api/v1/admin/tenants/{id}/suspend` | `reason` is optional; blocks the tenant workspace |
| POST | `/api/v1/admin/tenants/{id}/reactivate` | Restores workspace access |

Platform admin routes require `users.is_platform_admin`. Seed `AdminSeeder` to create
`admin@demo.test`, or promote an existing user:

```bash
php artisan tinker --execute="App\Models\User::where('email','you@example.com')->first()->forceFill(['is_platform_admin' => true])->save();"
```

## Deployment

See [docs/deployment.md](docs/deployment.md) for the full Vercel + Render + Supabase setup.

- **Web:** Vercel project with Root Directory `apps/web`. `apps/web/vercel.json` handles SPA routing.
  Set `VITE_API_URL=https://restaurant-pos-api-o7kw.onrender.com`.
- **API:** Render free web service from `render.yaml` (Docker, root `apps/api`, health check `/up`).
  Free services sleep after 15 idle minutes and cannot run workers or cron, so
  `QUEUE_CONNECTION=sync`. Run `php artisan migrate --force` from your machine against the
  Supabase database.
- **Database:** Supabase. Use the session pooler for the API. Migrate from your
  machine or CI, not on container boot.
- **Storage:** Supabase Storage bucket + S3 access keys; set the `AWS_*` variables above.

## Current status

Phase 0 / M1 foundation:

- [x] Monorepo restructure (`apps/api`, `apps/web`)
- [x] PostgreSQL (Supabase) connected, migrations + demo seed
- [x] Sanctum token auth, registration, login, email verification hooks
- [x] Tenant, branch, membership models with a fail-closed global scope
- [x] Manual approval gate (`pending_approval` tenants cannot use the workspace)
- [x] React auth flow, pending-approval screen, dashboard shell
- [x] Feature tests for auth and tenant isolation
- [x] Platform admin approval queue (`/admin`): approve, suspend, reactivate, owner emails
- [ ] App-wide tenant switcher (`/t/{slug}` path scheme)
- [ ] Onboarding wizard, catalog, orders, cash payments
