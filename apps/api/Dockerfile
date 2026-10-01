FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @ctws/api --filter @ctws/web build
# Production-only dependencies of @ctws/api (contracts is bundled into dist, so it is not needed).
RUN pnpm --filter @ctws/api --prod deploy --legacy /deploy

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
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
CMD ["sh", "-c", "node dist/db/migrate.js && exec node dist/server.js"]
