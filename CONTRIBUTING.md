# Contributing

Developer runbook. Requires Node >= 24 (see `.nvmrc`), pnpm (via corepack) and Docker.

## First-time setup

```sh
git config core.hooksPath .githooks   # enables the commit-msg hook (Conventional Commits)
pnpm install
cp .env.example .env                  # then edit: set AUTH_REGISTRATION=open for local use
```

The first account registered on an empty database becomes the instance admin, locally too (even
with `AUTH_REGISTRATION=closed`). Later accounts are `member` unless an admin creates them with a
role via `POST /api/v1/admin/users`.

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
same-origin as well.

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

## Checks

```sh
pnpm format:check
pnpm typecheck
pnpm build
```

## One rule about numbers

**Every number in a comment, a test or a commit message is either measured — with the measurement
written next to it — or marked as not yet measured.** No "roughly", no "on the order of", no
"still fine": whoever implements it will build to the number, and a guess dressed as a constraint
costs more in rework than the measurement would have cost.

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
AUTH_RATE_LIMIT_MAX=1000
```

The last one matters: every test registers a fresh user from one IP, and the default limit of 20
per minute makes the suite fail with registration timeouts.

```sh
pnpm --filter @ctws/web exec playwright install chromium   # once
docker compose up -d --wait postgres
pnpm --filter @ctws/api db:migrate
docker compose up -d --build --wait api
pnpm --filter @ctws/web e2e
```

After changing `.env`, recreate the API container (`docker compose up -d --force-recreate api`).

## Licensing

The project's own code is MIT (`LICENSE`). Two third-party faces ship with the web app, both under
the SIL Open Font License 1.1:

- **Noto Sans SC**, as a subset built by `tools/fonts/subset-cjk-font.py` and committed at
  `apps/web/src/fonts/noto-sans-sc-subset.woff2`. Because it is redistributed from this repository,
  upstream's own license file travels beside it: `apps/web/src/fonts/OFL.txt`, plus the
  `NOTICE.txt` the face is published with. The subset's internal family name is
  `CTWS Noto Sans SC` -- it is a modified version, and OFL reserves the name `Source`.
- **IBM Plex Sans**, as the `@fontsource/ibm-plex-sans` dependency, whose license travels in the
  package. Nothing of it is vendored here.
