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

```sh
docker compose up -d --wait postgres     # Postgres on 127.0.0.1:5432
pnpm --filter @ctws/api db:migrate       # apply migrations (reads DATABASE_URL from .env)
pnpm --filter @ctws/api dev              # API on http://localhost:3000
pnpm --filter @ctws/web dev              # web app on http://localhost:5173
```

`docker compose up` starts the API container too, but it does not migrate: run `db:migrate`
against a fresh volume before using it. Keep `DATABASE_URL` in `.env` in sync with the
`POSTGRES_*` values. Change `POSTGRES_PASSWORD` for anything that is not local dev.

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

The e2e is deliberately cross-site: the web app is served from `127.0.0.1:5173` and the API from
`localhost:3000`, so the API must run with the production cookie mode. Set these in `.env`:

```
AUTH_REGISTRATION=open
CORS_ORIGINS=http://127.0.0.1:5173
COOKIE_SAMESITE=none
COOKIE_SECURE=true
```

```sh
pnpm --filter @ctws/web exec playwright install chromium   # once
docker compose up -d --wait postgres
pnpm --filter @ctws/api db:migrate
docker compose up -d --build --wait api
pnpm --filter @ctws/web e2e
```

Playwright starts the web dev server itself. With `COOKIE_SAMESITE=lax` the e2e is expected to fail.
After changing `.env`, recreate the API container (`docker compose up -d --force-recreate api`).
