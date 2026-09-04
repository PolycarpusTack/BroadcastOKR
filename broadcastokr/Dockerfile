# Instance image (R7): the app bundle for one edition + the bridge that serves
# it. Build args: EDITION=client|internal (what vite builds), MODE=client|cockpit
# (what the bridge runs as). Runtime configuration is the instance .env
# (docs/operations.md) — mount the data directory and pass the env file.

FROM node:22-slim AS app
ARG EDITION=client
ARG APP_VERSION
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN VITE_EDITION=$EDITION npx vite build

FROM node:22-slim
ARG MODE=client
WORKDIR /app
COPY bridge/package.json ./bridge/
RUN cd bridge && npm install --omit=dev
COPY bridge ./bridge
COPY --from=app /src/dist ./dist
RUN mkdir -p /app/data /app/logs /app/backups \
  && rm -f bridge/config.json bridge/kpi-history.json bridge/*.db bridge/*.db-* bridge/.env
ENV BRIDGE_MODE=$MODE \
    BRIDGE_PORT=3001 \
    BRIDGE_HOST=0.0.0.0 \
    BRIDGE_DB_PATH=/app/data/broadcastokr.db \
    BRIDGE_CONFIG_PATH=/app/data/config.json \
    BRIDGE_HISTORY_PATH=/app/data/kpi-history.json \
    BRIDGE_LOG_DIR=/app/logs \
    BRIDGE_BACKUP_DIR=/app/backups \
    BRIDGE_APP_DIR=/app/dist
EXPOSE 3001
CMD ["node", "bridge/server.cjs"]
