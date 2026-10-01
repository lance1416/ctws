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

FROM node:24-alpine
WORKDIR /app
RUN corepack enable
ENV NODE_ENV=production
# The API serves the web build from here; unset it (or point elsewhere) for an API-only run.
ENV WEB_DIST=/app/apps/web/dist
COPY --from=build /app /app
EXPOSE 3000
CMD ["node", "apps/api/dist/server.js"]
