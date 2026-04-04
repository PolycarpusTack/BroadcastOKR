FROM node:22-slim
WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY . .
RUN mkdir -p /app/data /app/logs /app/backups
ENV BRIDGE_PORT=3001
ENV BRIDGE_HOST=0.0.0.0
ENV BRIDGE_DB_PATH=/app/data/broadcastokr.db
ENV BRIDGE_LOG_DIR=/app/logs
ENV BRIDGE_BACKUP_DIR=/app/backups
EXPOSE 3001
CMD ["node", "server.cjs"]
