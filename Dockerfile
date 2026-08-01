# syntax=docker/dockerfile:1

ARG NODE_VERSION=24-alpine

# ---- deps: full install, used only to compile -------------------------------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- build: emit dist/ ------------------------------------------------------
FROM node:${NODE_VERSION} AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ---- prod-deps: runtime dependencies only -----------------------------------
FROM node:${NODE_VERSION} AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- runtime ----------------------------------------------------------------
FROM node:${NODE_VERSION} AS runtime

ENV NODE_ENV=production \
    PORT=3000

WORKDIR /app

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./

# The `node` user ships with the official image. Never run the app as root.
USER node

EXPOSE 3000

# Redundant (it's the default) but explicit: this is the signal server.ts handles.
STOPSIGNAL SIGTERM

# `node -e` rather than curl/wget — neither is guaranteed in the base image,
# and Node has had a global fetch since v18.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT}/health`).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

# MUST be exec form (JSON array). Shell form would run this under `/bin/sh -c`,
# making sh PID 1; sh does not forward SIGTERM to its child, so `docker stop`
# would hang for the full grace period and then SIGKILL the app mid-request.
# For the same reason this is NOT `npm start` — npm is another process in the
# way that does not reliably forward signals.
CMD ["node", "dist/server.js"]
