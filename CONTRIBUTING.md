# Contributing

Developer runbook. Requires Node >= 24 (see `.nvmrc`), pnpm (via corepack) and Docker.

## First-time setup

```sh
git config core.hooksPath .githooks   # enables the commit-msg hook (Conventional Commits)
pnpm install
cp .env.example .env                  # then edit: set AUTH_REGISTRATION=open for local use
```

Commit messages are a single Conventional Commits subject line (lowercase scope, no trailing
period, at most 72 characters); the hook rejects anything else.

## Run locally

The browser talks to a single origin, in development and in the deployed image alike.

Single image (what ships): the API container serves the built web app too.

```sh
docker compose up -d --wait postgres     # Postgres on 127.0.0.1:5432
pnpm --filter @ctws/api db:migrate       # apply migrations (reads DATABASE_URL from .env)
docker compose up -d --build --wait api  # app and API on http://localhost:3000
```

Two dev servers (hot reload): Vite serves the web app and proxies `/api` to the API, so this is
same-origin as well and needs no CORS.

```sh
docker compose up -d --wait postgres
pnpm --filter @ctws/api db:migrate
pnpm --filter @ctws/api dev              # API on http://localhost:3000
pnpm --filter @ctws/web dev              # web app on http://localhost:5173, proxies /api
```

The compose API container does not migrate: run `db:migrate` against a fresh volume first. Keep
`DATABASE_URL` in `.env` in sync with the `POSTGRES_*` values, and change `POSTGRES_PASSWORD`
for anything that is not local dev. For plain-http local use set `COOKIE_SECURE=false`.

`WEB_DIST` (set by the image) makes the API serve the web build; unset, it is API only.
`CORS_ORIGINS` and `VITE_API_BASE` are only needed for a split (cross-origin) deployment.

## Checks

```sh
pnpm format:check
pnpm typecheck
pnpm build
```

## Tests

```sh
pnpm --filter @ctws/contracts test   # unit
pnpm --filter @ctws/api test         # integration; needs Docker (Testcontainers starts Postgres)
pnpm --filter @ctws/web test         # unit
```

### End-to-end (Playwright)

The e2e runs against the real image, same-origin: the API container serves the built web app and
Playwright drives `http://localhost:3000` for both the page and the API. There is no dev server.
Set these in `.env`:

```
AUTH_REGISTRATION=open
COOKIE_SECURE=false
```

```sh
pnpm --filter @ctws/web exec playwright install chromium   # once
docker compose up -d --wait postgres
pnpm --filter @ctws/api db:migrate
docker compose up -d --build --wait api
pnpm --filter @ctws/web e2e
```

After changing `.env`, recreate the API container (`docker compose up -d --force-recreate api`).
