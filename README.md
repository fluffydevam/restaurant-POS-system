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
manager@demo.test / password   # manager at Demo Restaurant
staff@demo.test   / password   # staff at Demo Restaurant
admin@demo.test   / password   # platform admin, no restaurant membership
pending@demo.test / secret123  # owner of Pending Cafe (waiting for approval)
```

The platform admin signs in and lands on `/admin`, the approval queue.

### Workspace URLs

Every workspace lives under its restaurant slug, for example `/t/demo`, `/t/demo/pos`, and
`/t/demo/settings`. Links can be shared with anyone who belongs to that restaurant. Visiting a slug
you do not belong to shows a workspace picker instead of leaking data.

Legacy paths (`/`, `/pos`, `/orders`, `/menu`, `/tables`, `/staff`, `/settings`, `/onboarding`) redirect to the remembered
workspace, so old bookmarks keep working. When a user belongs to more than one active restaurant, an
in-app switcher appears in the sidebar and header, and the last used workspace is remembered across
sessions. Pending applications remain on `/pending` until approved.

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
| PATCH | `/api/v1/tenant` | Profile, currency, tax/service charges, receipt footer (`owner`/`manager`) |
| PATCH | `/api/v1/branches/{id}` | Branch name, address, timezone, active flag (`owner`/`manager`) |
| GET | `/api/v1/menu/categories` | Tenant-scoped menu categories |
| POST | `/api/v1/menu/categories` | Create category (`owner`/`manager`) |
| PATCH | `/api/v1/menu/categories/{id}` | Update category (`owner`/`manager`) |
| DELETE | `/api/v1/menu/categories/{id}` | Delete empty category (`owner`/`manager`) |
| GET | `/api/v1/menu/items` | Items with `category_id`, `search`, `active`, `per_page` filters |
| POST | `/api/v1/menu/items` | Create item (`owner`/`manager`), `price_cents` integer |
| PATCH | `/api/v1/menu/items/{id}` | Update item (`owner`/`manager`) |
| DELETE | `/api/v1/menu/items/{id}` | Soft-delete item (`owner`/`manager`) |
| GET | `/api/v1/orders` | Order history with `status`, `date`, `search`, `page` |
| GET | `/api/v1/orders/summary` | Today's sales, order count, open orders, average |
| GET | `/api/v1/orders/{id}` | Order detail with line-item snapshots |
| POST | `/api/v1/orders` | Open an order from menu item IDs (`owner`/`manager`/`staff`) |
| POST | `/api/v1/orders/{id}/pay` | Cash payment; records tendered and change |
| POST | `/api/v1/orders/{id}/void` | Void an open order (`owner`/`manager`) |
| GET | `/api/v1/tables` | Floor list with `branch_id`, `status`, `search` filters and usage caps |
| POST | `/api/v1/tables` | Create table (`owner`/`manager`) |
| PATCH | `/api/v1/tables/{id}` | Edit table (`owner`/`manager`) |
| PATCH | `/api/v1/tables/{id}/status` | Change status; all roles with an active membership |
| DELETE | `/api/v1/tables/{id}` | Soft-delete table (`owner`/`manager`) |
| GET | `/api/v1/staff` | Team list with `role`, `active`, `search` filters and usage caps |
| POST | `/api/v1/staff` | Add a member with a login (`owner`/`manager`; managers may only add staff) |
| PATCH | `/api/v1/staff/{id}` | Edit role/name/branch/active state, with owner lockout protection |
| DELETE | `/api/v1/staff/{id}` | Remove a member, with owner lockout protection |
| GET | `/api/v1/admin/stats` | Platform admin only: tenant counts by status |
| GET | `/api/v1/admin/tenants` | Platform admin only: `status`, `search`, `page` filters |
| POST | `/api/v1/admin/tenants/{id}/approve` | Activates the tenant, provisions a default branch, emails the owner |
| POST | `/api/v1/admin/tenants/{id}/suspend` | `reason` is optional; blocks the tenant workspace |
| POST | `/api/v1/admin/tenants/{id}/reactivate` | Restores workspace access |

### Free plan caps

The platform stays free forever, so each tenant has soft caps configured in `apps/api/config/tenants.php`
(or via `TENANT_LIMIT_*` environment variables):

| Resource | Default cap |
|---|---|
| Branches | 3 |
| Dining tables | 30 |
| Staff members | 10 |
| Menu items | 150 |

List endpoints return `meta.limits` with `used`, `limit`, `percent`, `near_limit`, and `at_limit` for
each resource. The UI shows a progress notice at 80% and disables creation at 100%; the API also
rejects new records with a validation error so direct calls cannot bypass the cap. Existing records
can always be edited or deleted.

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
- [x] Menu catalog: categories, items, prices in cents, availability flags, `/menu` UI
- [x] Point of sale: cart, order types, cash payment with change, receipt
- [x] Order ledger: filters, daily summary, detail view, void open orders
- [x] Settings (`/settings`) and a four-step onboarding wizard (`/onboarding`)
- [x] Tax and service charge configured in basis points, applied to new orders and receipts
- [x] Slug-based workspace URLs (`/t/{slug}`), legacy redirects, and a multi-restaurant switcher
- [x] Tables and staff role management, with soft per-tenant caps
