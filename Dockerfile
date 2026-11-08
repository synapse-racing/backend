# Builds each workspace app into its own runnable image.
#
#   docker build --build-arg APP=api --tag synapse-api .
#   docker build --build-arg APP=core-api --tag synapse-core-api .
#   docker build --build-arg APP=multiplayer --tag synapse-multiplayer .

ARG APP=api

FROM node:24-alpine AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

FROM base AS dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
COPY apps ./apps
COPY libs ./libs
RUN pnpm install --frozen-lockfile

FROM dependencies AS build

COPY . .
# Copy the prisma CLI and generated client into the service bundle. The
# generated .prisma/client lives inside the workspace virtual store and
# pnpm deploy re-installs from the registry without it.
RUN pnpm prisma:generate && pnpm build \
  && pnpm --filter "@synapse/${APP}" deploy --legacy /out \
  && mkdir -p /out/node_modules/.prisma \
  && cp -a node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client /out/node_modules/.prisma/client

FROM node:24-alpine AS runtime

RUN apk add --no-cache dumb-init
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build --chown=node:node /out /app
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --chown=node:node docker-entrypoint.sh ./docker-entrypoint.sh
COPY --chown=node:node docker/healthcheck.js ./docker/healthcheck.js

# Per-app defaults: service name, port and readiness path for the healthcheck.
RUN set -eu; \
    printf 'APP_NAME=%s\n' "$APP" > /usr/local/share/synapse-app.env; \
    case "$APP" in \
      multiplayer) \
        printf 'HEALTH_PORT_DEFAULT=3002\n' >> /usr/local/share/synapse-app.env; \
        printf "HEALTH_PATH_DEFAULT='/socket.io/?EIO=4&transport=polling'\n" >> /usr/local/share/synapse-app.env; \
        ;; \
      core-api) \
        printf 'HEALTH_PORT_DEFAULT=3001\n' >> /usr/local/share/synapse-app.env; \
        ;; \
      *) \
        printf 'HEALTH_PORT_DEFAULT=3000\n' >> /usr/local/share/synapse-app.env; \
        ;; \
    esac

USER node

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD sh -c '. /usr/local/share/synapse-app.env && exec node /app/docker/healthcheck.js'

ENTRYPOINT ["dumb-init", "--", "sh", "./docker-entrypoint.sh"]
