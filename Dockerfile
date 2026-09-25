# syntax=docker/dockerfile:1
# Match the repository runtime; pin the resolved image digest in release records.
ARG NODE_IMAGE=node:24.21.0-bookworm-slim
FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.18.3 --activate
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/docs/package.json apps/docs/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/application/package.json packages/application/package.json
COPY packages/sdk/package.json packages/sdk/package.json
RUN --mount=type=cache,id=myanlex-pnpm,target=/pnpm/store pnpm install --frozen-lockfile --ignore-scripts --store-dir=/pnpm/store
COPY . .
RUN pnpm db:generate

FROM dependencies AS api-build
RUN pnpm --filter @myanlex/api... build
RUN --mount=type=cache,id=myanlex-pnpm,target=/pnpm/store pnpm --filter @myanlex/api deploy --prod --offline --ignore-scripts --store-dir=/pnpm/store /runtime/apps/api

FROM base AS migrate
# Operational image only: tooling and migrations are not in the API runtime.
COPY --from=api-build --chown=node:node /app /app
COPY --from=base --chown=node:node /root/.cache/node/corepack /home/node/.cache/node/corepack
ENV NODE_ENV=production
USER node
CMD ["pnpm", "db:deploy"]

FROM ${NODE_IMAGE} AS api
WORKDIR /app
ENV NODE_ENV=production PORT=3001
COPY --from=api-build --chown=node:node /runtime /app
COPY --from=api-build --chown=node:node /app/openapi /app/openapi
COPY LICENSE THIRD_PARTY_NOTICES.md /app/
USER node
EXPOSE 3001
CMD ["node", "apps/api/dist/main.js"]

FROM dependencies AS web-build
RUN mkdir -p apps/web/public
# Public origins and Next rewrites are baked into the build. Never pass secrets.
ARG API_INTERNAL_URL=http://api:3001
ARG NEXT_PUBLIC_DOCS_URL=http://localhost:3002
ARG NEXT_PUBLIC_API_DOCS_URL=http://localhost:3001/docs
ENV API_INTERNAL_URL=$API_INTERNAL_URL
ENV NEXT_PUBLIC_DOCS_URL=$NEXT_PUBLIC_DOCS_URL
ENV NEXT_PUBLIC_API_DOCS_URL=$NEXT_PUBLIC_API_DOCS_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @myanlex/web build

FROM ${NODE_IMAGE} AS web
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --from=web-build --chown=node:node /app/apps/web/.next/standalone /app
COPY --from=web-build --chown=node:node /app/apps/web/.next/static /app/apps/web/.next/static
COPY --from=web-build --chown=node:node /app/apps/web/public /app/apps/web/public
COPY LICENSE THIRD_PARTY_NOTICES.md /app/
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

FROM dependencies AS docs-build
RUN mkdir -p apps/docs/public
ARG NEXT_PUBLIC_CONSOLE_URL=http://localhost:3000
ENV NEXT_PUBLIC_CONSOLE_URL=$NEXT_PUBLIC_CONSOLE_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @myanlex/docs build

FROM ${NODE_IMAGE} AS docs
WORKDIR /app
ENV NODE_ENV=production PORT=3002 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --from=docs-build --chown=node:node /app/apps/docs/.next/standalone /app
COPY --from=docs-build --chown=node:node /app/apps/docs/.next/static /app/apps/docs/.next/static
COPY --from=docs-build --chown=node:node /app/apps/docs/public /app/apps/docs/public
COPY --from=docs-build --chown=node:node /app/openapi /app/openapi
COPY LICENSE THIRD_PARTY_NOTICES.md /app/
USER node
EXPOSE 3002
CMD ["node", "apps/docs/server.js"]
