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
`<owner>` must be lowercase. If the package is private, run `docker login ghcr.io` once on the
server with a token that has `read:packages`.

The compose file fixes the production app settings: `AUTH_REGISTRATION=closed`,
`COOKIE_SECURE=true`, `COOKIE_SAMESITE=lax`, no CORS origins. With registration closed, `/auth` registration returns 403 for everyone, including the first user,
and the repo has no other account-creation path yet. Create the first account by temporarily
editing `AUTH_REGISTRATION` in the compose file to `open` (or `invite` plus `AUTH_INVITE_CODE`),
then set it back to `closed`.

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
