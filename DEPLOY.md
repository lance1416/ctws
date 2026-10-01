# Deploying CTWS

Single server (amd64), Docker Compose, Cloudflare Tunnel in front. The image comes from GHCR,
built by `.github/workflows/release.yml` when a `v*` tag is pushed.

## 1. Env file

Copy `compose.prod.yaml` to the server and create `.env` next to it (compose reads it
automatically):

```
IMAGE=ghcr.io/<owner>/ctws:v1.0.0
POSTGRES_PASSWORD=<long random value>
# optional, default ctws
# POSTGRES_USER=ctws
# POSTGRES_DB=ctws
```

`IMAGE` and `POSTGRES_PASSWORD` are required: compose refuses to start without them.
`<owner>` must be lowercase.

**The repository is private, so the GHCR package is private too — the pull will fail without
authentication.** Run this once on the server, with a personal access token that has
`read:packages`:

```sh
echo "$GHCR_TOKEN" | docker login ghcr.io -u <owner> --password-stdin
```

Make the package public instead if you would rather not keep a token on the server: GitHub →
Packages → `ctws` → Package settings → Change visibility. A public image is pullable without
credentials, and GHCR does not bill bandwidth for public packages.

The compose file fixes the production app settings: `AUTH_REGISTRATION=closed`,
`COOKIE_SECURE=true`, `COOKIE_SAMESITE=lax`, no CORS origins.

### First admin

While the user table is empty, registration is allowed regardless of `AUTH_REGISTRATION`, and the
first account created becomes the instance admin. Once any user exists, `closed` applies again
(403 for everyone) and further accounts are created by an admin through `POST /api/v1/admin/users`.

The first-run race: while the user table is empty, whoever reaches the instance first becomes
admin. Do not expose a fresh instance publicly before you have registered. For example, register
through `http://127.0.0.1:3000` on the host before pointing the tunnel at it (section 4).

Instances deployed before roles existed are migrated automatically: the earliest existing user
is promoted to admin.

## 2. Deploy

```
docker compose -f compose.prod.yaml pull && docker compose -f compose.prod.yaml up -d
```

## 3. Migrations

Automatic. The container runs `node dist/db/migrate.js` and then starts the server, so a new image
or a fresh volume is migrated before the API listens. If migrations fail the container exits
and restarts; check `docker compose -f compose.prod.yaml logs api`.

## 4. Cloudflare Tunnel

The API listens on `127.0.0.1:3000` only. Point the tunnel's public hostname at
`http://127.0.0.1:3000` (cloudflared running on the host). Postgres publishes no port.

Alternative, not set up here: run `cloudflared` as another compose service and point the tunnel at
`http://api:3000`; the host port mapping would then be unnecessary.

## 5. Roll back

Set `IMAGE` in `.env` to the previous tag and run the deploy command again. Migrations are
forward-only: a rollback does not undo schema changes, so only roll back across releases
without a migration, or restore a database backup.
