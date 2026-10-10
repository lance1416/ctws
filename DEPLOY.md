# Deploying CTWS

Single server (amd64), Docker Compose, Cloudflare Tunnel in front. The image comes from GHCR,
built by the `image` job in `.github/workflows/ci.yml` when a `v*` tag is pushed -- and only once
that commit's own checks and e2e suite have passed, so a tag whose suite is red publishes nothing.

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
`COOKIE_SECURE=true`, `COOKIE_SAMESITE=lax`, no CORS origins. The one exception is
`AUTH_RATE_LIMIT_MAX` (requests per minute on the auth endpoints, default `20`): the compose file
passes it through from the production env file, so set it there if a shared tunnel address trips
the limit.

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

### Worth one rule at the edge: rate limit `/api/v1/auth/*`

The app already bounds what a sign-in flood can spend. Attempts are counted **per email address**
(20/min, `AUTH_RATE_LIMIT_MAX`) so one account under attack cannot lock out the others, and a
**second counter caps the whole instance** (600/min, `AUTH_CEILING`) because verifying a password
costs real CPU even when the address does not exist — deliberately, so that a wrong address and a
wrong password take the same time. Measured: one refused sign-in is about 13ms of CPU, so 600/min
is roughly 13% of one core.

What the application cannot do is stay signable-in _while_ that flood is arriving: the ceiling is
global, so a flood eats the minute's budget and your own sign-in is refused along with it. Keeping
an unauthenticated endpoint usable under a flood is the edge's job, not the app's.

In the Cloudflare dashboard, under **Security → WAF → Rate limiting rules**:

| Field                      | Value                                                        |
| -------------------------- | ------------------------------------------------------------ |
| If incoming requests match | `URI Path` starts with `/api/v1/auth/`                       |
| Rate                       | 20 requests per 1 minute                                     |
| Counting characteristics   | IP (or JA4 fingerprint, which survives IPv6 rotation better) |
| Then take action           | Block, for 1 minute                                          |

20/min per source is far above anything a person does — a human signing in makes one request —
and it keeps the flood off the origin entirely, so the instance ceiling never fires and your own
sign-in still works. Leave the application's own limits where they are: the edge rule is a second
layer, and the app must stay safe if the tunnel is ever bypassed.

## 5. Roll back

Set `IMAGE` in `.env` to the previous tag and run the deploy command again. Migrations are
forward-only: a rollback does not undo schema changes, so only roll back across releases
without a migration, or restore a database backup.
