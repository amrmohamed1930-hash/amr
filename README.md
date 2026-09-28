# Watanya Store

Arabic RTL e-commerce storefront and API for a consumer-finance electronics store.
Express + MySQL on the back end, a dependency-free static front end served by the
same process.

## Requirements

- Node.js >= 20 (developed on 24.x)
- MySQL 8.0+

## Quick start

```bash
npm install
cp .env.example .env        # then fill in the values
npm run db:setup            # creates the DB, applies schema, seeds data
npm run dev                 # http://localhost:4000
```

`db:setup` needs an account with `CREATE`/`DROP` rights. It defaults to
`DB_USER` / `DB_PASSWORD`, so set `SETUP_DB_USER` and `SETUP_DB_PASSWORD` in
`.env` (or the environment) to an admin account if your runtime user is
restricted. The script grants the runtime user access to the database it just
created, so you do not have to do that by hand.

The script is safe to re-run. Existing tables and duplicate seed rows are
skipped, so it doubles as a "make sure my data is up to date" command.

### Demo accounts

The seed creates no customers. Register through the storefront, or use the admin
account below.

| Role    | Email                  | Password       |
| ------- | ---------------------- | -------------- |
| Admin   | `admin@watanya.com`    | `Watanya@2026` |

## Configuration

All settings live in `.env`; see `.env.example` for the full list. The ones that
matter most:

| Variable | Purpose |
| --- | --- |
| `DB_*` | MySQL connection used by the API |
| `SETUP_DB_*` | Admin credentials, used only by `npm run db:setup` |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Signing keys. **Change these before deploying.** |
| `CLIENT_ORIGIN` | CORS allow-list (the storefront is same-origin, so this only matters for external clients) |
| `RATE_LIMIT_DISABLED` | Turns off all rate limiting. Local testing only, never production. |

Generate fresh secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Scripts

| Command | Description |
| --- | --- |
| `npm start` | Run the server |
| `npm run dev` | Run with `--watch` |
| `npm run db:setup` | Create database, apply schema, seed. Idempotent. |
| `npm run db:seed` | Seed only (assumes the schema exists) |
| `npm test` | SQL splitter unit tests (no server or database needed) |
| `npm run smoke` | Full API suite against a running server. Mutates data. |

The smoke suite creates and cancels orders and adjusts stock, so point it at a
development database. It stops with a clear message if it cannot find a suitable
product rather than corrupting data to make a test pass.

## Layout

```
src/
  app.js            Express app, route mounting, static file allow-list
  server.js         Listener and shutdown handling
  config/           env parsing, MySQL pool
  routes/           HTTP layer: auth, product, shop, admin, taxonomy
  controllers/      Request -> service -> response
  services/         SQL and business logic
  validations/      zod request schemas
  middleware/       auth, rate limiting, validation, error handling
scripts/
  db-setup.js       One-command database bootstrap
  seed.js           Idempotent demo data
  smoke-test.js     End-to-end API suite
  test-db-setup.js  Unit tests for the SQL statement splitter
uploads/            Product images
```

The project root also holds `.env` and `database.sql`, so the root directory is
never mounted as static content. `src/app.js` serves an explicit allow-list of
front-end files, and everything else 404s.

## Product images

`product_images.image_path` is stored relative to the server root, e.g.
`uploads/iphone.png`. The seed uses a single placeholder for all demo products.
A fresh clone needs `uploads/iphone.png` present (it is tracked in git) or
product cards fall back to no image.

## API

All responses use the envelope `{ success, data }` with errors as
`{ success: false, error: { code, message, details } }`.

Authentication lives under `/api/auth`, and customer shopping routes are mounted
at `/api/me` (cart, wishlist, orders, reviews).

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/health` | Liveness plus database check |
| `GET` | `/api/config` | Storefront configuration |
| `GET` | `/api/storefront` | Navigation data |
| `GET` | `/api/products` | Filters, sort, pagination; returns `meta` and `facets` |
| `GET` | `/api/products/:slug` | Single product |
| `GET` | `/api/products/featured`, `/api/products/search` | |
| `GET` | `/api/products/loanable` | Available through financing |
| `GET` | `/api/categories`, `/api/categories/:slug` | |
| `GET` | `/api/brands`, `/api/brands/:slug` | |
| `POST` | `/api/auth/register`, `/api/auth/login` | `identifier` accepts email or phone |
| `POST` | `/api/auth/refresh`, `/api/auth/logout` | Refresh tokens rotate and carry a unique `jti` |
| `GET`/`PATCH` | `/api/auth/me` | Profile |
| `POST` | `/api/auth/change-password`, `/api/auth/logout-all` | |
| `POST` | `/api/auth/admin/login` | Admin login |
| `GET` | `/api/auth/admin/me` | |
| `GET`/`PATCH`/`DELETE` | `/api/me/cart`, `/api/me/cart/items` | |
| `GET`/`POST`/`DELETE` | `/api/me/wishlist`, `/api/me/wishlist/:id/toggle` | |
| `GET`/`POST` | `/api/me/orders` | Checkout |
| `GET` | `/api/me/orders/:id` | |
| `POST` | `/api/me/orders/:id/cancel` | |
| `POST`/`DELETE` | `/api/me/reviews`, `/api/me/reviews/:id` | Create or delete your own review |
| `GET` | `/api/products/:id/reviews` | Public review list for a product |
| `GET` | `/api/admin/stats`, `/api/admin/orders` | |
| `GET` | `/api/admin/products/:id`, `/api/admin/products/:id/price-history` | |
| `POST`/`PATCH`/`DELETE` | `/api/admin/products/:id`, `/api/admin/brands/:id`, `/api/admin/categories/:id` | |
| `PATCH` | `/api/admin/orders/:id/status` | |

There is no admin product list route; admin reads a single product by id and uses
the public product routes for browsing.

When a bearer token is sent to `/api/products`, each product gains `in_cart` and
`in_wishlist` flags so the storefront can render that state directly.

## Front end

`index.html`, `style.css` and `script.js` at the project root. No build step and
no framework; `script.js` is plain ES5-style browser JavaScript that calls the
API on the same origin. Tokens live in `localStorage` and refresh
single-flighted, so a burst of parallel 401s triggers only one rotation.

## Admin panel

`admin.html` + `admin.js` (same stylesheet, same no-build approach) is a
separate sign-in page for `/api/auth/admin/login`; the storefront footer links
to it. It stores its token under `watanya.admin.*`, apart from the customer
keys, so signing in on one page never disturbs a session on the other.

`POST /api/auth/admin/login` returns an access token only - no refresh token -
so a panel session is hard-capped at `JWT_EXPIRES_IN` (15 minutes by default).
The header shows a countdown, and any `401`/`403` (expired token, deactivated
admin) drops the token and returns to the sign-in card.

The panel covers the dashboard stats, the order list with status changes, and a
single-product view with price history and a price/reason form. It uses the
admin API only, so it grants no access the API would not already give it.

