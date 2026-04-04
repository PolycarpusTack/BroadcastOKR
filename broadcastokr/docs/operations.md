# BroadcastOKR Operations Guide

## Deployment

### Docker (recommended)

```bash
cd BroadcastOKR
cp broadcastokr/bridge/.env.example broadcastokr/bridge/.env
# Edit .env: set BRIDGE_API_KEY to a strong random value

docker compose up -d
docker compose logs -f bridge    # Watch logs
```

### Bare Metal

```bash
cd broadcastokr/bridge
cp .env.example .env
# Edit .env: set BRIDGE_API_KEY

npm install --production
node server.cjs
```

## Backup & Restore

### Automatic Backups

The bridge does not yet auto-backup. Set up a cron job:

```bash
# Daily backup at 2 AM
0 2 * * * cp /path/to/broadcastokr.db /path/to/backups/broadcastokr-$(date +\%Y\%m\%d).db
```

### Manual Backup

```bash
# Via API
curl -H "Authorization: Bearer <KEY>" http://bridge:3001/api/sync/backup -o backup.db

# Or copy the file directly
cp bridge/broadcastokr.db backups/broadcastokr-$(date +%Y%m%d).db
```

### Restore

1. Stop the bridge
2. Replace `broadcastokr.db` with the backup file
3. Start the bridge

## Log Files

| Location | Content | Rotation |
|----------|---------|----------|
| `bridge/logs/bridge.log` | HTTP request logs | Daily, 30 day retention |
| `%APPDATA%/BroadcastOKR/logs/` | Electron app logs (when configured) | — |

## Troubleshooting

### Bridge won't start

1. Check `.env` exists and `BRIDGE_PORT` is not in use
2. Check `node --version` is 22+
3. Check `npm install` was run in the bridge directory
4. Look at console output for error messages

### Connection test fails

1. Verify host/port/service are correct
2. For Oracle: ensure `ORACLE_CLIENT_DIR` points to Oracle Instant Client
3. For PostgreSQL: ensure the `pg` package is installed
4. Check firewall rules between bridge and database server

### Data migration from localStorage

If upgrading from a standalone (non-shared) installation:

1. Open the app while connected to the bridge
2. Open browser DevTools console
3. Run: `fetch('/api/sync/migrate-from-local', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer <KEY>' }, body: localStorage.getItem('broadcastokr-data') })`
4. Verify the response shows correct entity counts
5. Clear localStorage: `localStorage.removeItem('broadcastokr-data')`

### Bridge database is corrupted

1. Stop the bridge
2. Restore from the latest backup (see Restore above)
3. If no backup exists, delete `broadcastokr.db` — the bridge will recreate it with an empty schema on startup

## Updating

### Docker

```bash
docker compose pull
docker compose up -d
```

### Bare Metal

```bash
cd broadcastokr/bridge
git pull
npm install --production
# Restart the service
```

Migrations run automatically on startup — no manual steps needed.

## Security Notes

- `BRIDGE_API_KEY` must be set in production — without it, auth is disabled
- Database passwords in `config.json` are encrypted when `BRIDGE_API_KEY` is set
- The bridge only executes SELECT queries against external databases (enforced server-side)
- CORS origins are configurable — set `BRIDGE_CORS_ORIGINS` to match your deployment
