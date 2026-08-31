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

The bridge snapshots its database automatically: an online backup at startup
and then daily, to `BRIDGE_BACKUP_DIR` (default: a `backups/` directory next
to the database file; the desktop app uses its user-data directory), pruned to
the newest 14. Snapshots use SQLite's online backup API, so they are consistent
even while writes are happening. For off-machine copies, still ship the backup
directory elsewhere with a cron job:

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

Migration is automatic: on first connect to a bridge whose database is empty,
the app uploads its local data (users first, then teams, clients, templates,
goals, tasks) before adopting bridge state. If the upload fails, local data is
kept untouched and a toast reports the failure.

Manual fallback (e.g. migrating into a bridge that already has data — the
endpoint only inserts missing rows). The endpoint expects the state slices at
the top level, NOT the persisted `{"state":…,"version":…}` envelope, and must
be addressed at the bridge URL:

1. Open the app, open browser DevTools console
2. Run:
   ```js
   const { state } = JSON.parse(localStorage.getItem('broadcastokr-data'));
   fetch('http://localhost:3001/api/sync/migrate-from-local', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer <KEY>' },
     body: JSON.stringify(state),
   }).then(r => r.json()).then(console.log)
   ```
3. Verify the response shows correct entity counts

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
