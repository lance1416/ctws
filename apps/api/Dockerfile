FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
# Workspace manifests only, so the dependency layer caches on lockfile changes alone. This list
# must track pnpm-workspace.yaml: a missing package is NOT caught by --frozen-lockfile, it just
# installs fewer deps and surfaces later as an unresolved import during the bundle step.
COPY packages/contracts/package.json packages/contracts/
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY tools/palette/package.json tools/palette/
RUN pnpm install --frozen-lockfile
COPY . .
# What is being built, for the status bar and /health: CI's image job passes the release's tag and
# its commit; any other build is dev. The web build reads them from the environment.
ARG CTWS_VERSION=dev
ARG CTWS_COMMIT=
RUN pnpm --filter @ctws/api --filter @ctws/web build
# Production-only dependencies of @ctws/api (contracts is bundled into dist, so it is not needed).
RUN pnpm --filter @ctws/api --prod deploy --legacy /deploy
# `@node-rs/argon2` ships a prebuilt binary per platform and pnpm installs every Linux one it is
# offered. This image is Alpine, which loads the MUSL build; the gnu build beside it is 744KB that
# can never be opened. Removed by DIRECTORY, not by editing a manifest: the loader picks the file
# by name at require time, so a directory that is gone is simply a candidate that does not match,
# and the next line proves the remaining one still loads before the image is allowed to exist.
RUN rm -rf /deploy/node_modules/.pnpm/@node-rs+argon2-linux-x64-gnu@* \
  && node -e "const a=require('/deploy/node_modules/@node-rs/argon2');const h=a.hashSync('x');if(!a.verifySync(h,'x'))throw new Error('argon2 round trip failed');console.log('argon2 ok on musl')"
# The same for sharp, on whichever architecture builds: its glibc libvips is 17MB this image never
# loads (`linux-` is glibc; `linuxmusl-` is what Alpine loads). The check decodes and encodes a
# picture with what is left, so a sharp that cannot load stops the build, not the first upload.
RUN rm -rf /deploy/node_modules/.pnpm/@img+sharp-linux-* /deploy/node_modules/.pnpm/@img+sharp-libvips-linux-* \
  && node -e "require('/deploy/node_modules/sharp')({create:{width:4,height:4,channels:3,background:'#c00'}}).png().toBuffer().then(p=>require('/deploy/node_modules/sharp')(p).webp().toBuffer()).then(w=>{if(w.subarray(8,12).toString()!=='WEBP')throw new Error('sharp round trip failed');console.log('sharp ok on musl')})"

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
# The same two, for the API to say at /api/v1/health.
ARG CTWS_VERSION=dev
ARG CTWS_COMMIT=
ENV CTWS_VERSION=$CTWS_VERSION CTWS_COMMIT=$CTWS_COMMIT
# The API serves the web build from here; unset it (or point elsewhere) for an API-only run.
ENV WEB_DIST=/app/apps/web/dist
ENV MIGRATIONS_DIR=/app/drizzle
COPY --from=build /deploy/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/drizzle ./drizzle
COPY --from=build /app/apps/web/dist ./apps/web/dist
USER node
EXPOSE 3000
# Single instance: apply migrations, then listen.
CMD ["sh", "-c", "node dist/platform/db/migrate.js && exec node dist/server.js"]
