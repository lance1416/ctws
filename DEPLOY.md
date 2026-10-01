# Deploying CTWS

Single server (amd64), Docker Compose, Cloudflare Tunnel in front. The image comes from GHCR,
built by `.github/workflows/release.yml` when a `v*` tag is pushed.

## 1. Env file

Copy `compose.prod.yaml` to the server and create `.env` next to it (compose reads it
automatically):

```
IMAGE=ghcr.io/<owner>/ctws:v1.0.0
POSTGRES_PASSWORD=<output of: openssl rand -hex 32>
# optional, default ctws
# POSTGRES_USER=ctws
# POSTGRES_DB=ctws
```

`IMAGE` and `POSTGRES_PASSWORD` are required: compose refuses to start without them.
`<owner>` must be lowercase.

**Use a URL-safe password — `openssl rand -hex 32`, not `-base64`.** Compose assembles
`DATABASE_URL` by interpolating the password into a URL, so `/`, `+`, `=`, `#` and `?` make that
URL invalid (base64 output contains the first three), while `@` and `:` parse but yield a
different password than you set. The API now rejects an unparseable `DATABASE_URL` at startup
with a message saying so; before that check existed, `pg` reported it as a redacted
`ERR_INVALID_URL` thrown from inside a query.

**`POSTGRES_PASSWORD` only takes effect when the volume is first initialised.** Changing it later
does nothing to an existing database — the API will simply fail to authenticate. To change it you
must either `ALTER USER` inside Postgres, or destroy the volume
(`docker compose -f compose.prod.yaml down -v`, which loses all data).

**The package is public, so the server needs no registry credentials** — the repository itself
stays private. Package visibility is a separate setting from repository visibility: making the
repo public does not publish the package, and vice versa. It lives at
`https://github.com/users/<owner>/packages/container/ctws/settings`.

If you ever set the package back to private, the pull fails with `unauthorized` and the server
then needs a personal access token with `read:packages`:

```sh
echo "$GHCR_TOKEN" | docker login ghcr.io -u <owner> --password-stdin
```

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

Postgres publishes no port. The API's published address comes from `API_BIND`, which defaults to
`127.0.0.1` so nothing is reachable off the box until you say otherwise.

**If cloudflared runs on this same host**, leave `API_BIND` unset and point the tunnel at
`http://127.0.0.1:3000`.

**If cloudflared runs elsewhere** (its own LXC or VM, which is the usual shape when one tunnel
fronts several services), the API must be reachable over the network, so set this host's LAN
address in `.env`:

```
API_BIND=10.0.0.5
```

and point the tunnel at `http://10.0.0.5:3000`. This does expose the API to that network — the
application still requires authentication, but the HTTP endpoint is reachable by anything on the
subnet. Restrict it with a firewall rule allowing only the cloudflared host, or put the two on a
dedicated bridge or VLAN, if that matters to you.

Either way, register the first admin through the loopback address from inside this host _before_
pointing the tunnel at it — see the first-run race note in section 1.

Alternative, not set up here: run `cloudflared` as another service in this compose file and point
the tunnel at `http://api:3000`. The `ports:` mapping then becomes unnecessary and nothing is
published at all.

## 5. Roll back

Set `IMAGE` in `.env` to the previous tag and run the deploy command again. Migrations are
forward-only: a rollback does not undo schema changes, so only roll back across releases
without a migration, or restore a database backup.
