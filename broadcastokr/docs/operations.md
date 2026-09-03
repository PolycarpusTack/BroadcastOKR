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
even while writes are happening.

**One snapshot is the whole tenant.** WHATS'ON connections and Dashboard KPI
definitions are rows in the database (since 0.9.2 — before that they lived in
`config.json` and every snapshot was a `.db` + `.config.json` pair). A snapshot
restored on its own brings the goals, tasks, history *and* the connections back.
Old paired snapshots are still pruned as a unit, so a surviving old pair never
loses its config half.

```
broadcastokr-<stamp>.db            the tenant database (goals, tasks, history, connections, KPI definitions)
```

> **The backup directory holds credentials.** The snapshot carries stored
> connection passwords, encrypted exactly as the database holds them (i.e. only
> if `BRIDGE_ENCRYPTION_KEY` is set — see Credentials below). Give the backup
> directory the same protection as the bridge's data directory.

> **A backup is only complete with its key.** The passwords in the snapshot
> decrypt only under the key that wrote them. On a server that is
> `BRIDGE_ENCRYPTION_KEY` — keep it with the backup policy, not in the backup
> directory. On the **desktop app** the key is generated on first run and sealed
> to the Windows/macOS user account (`<userData>/bridge/credential-key`); it
> cannot be copied to another machine or account. A desktop backup restored
> elsewhere comes back with its goals, tasks and connections, and **every
> database password must be re-entered** on the Clients page. The bridge says so
> at startup and the Dashboard's System Health panel shows the count of
> passwords it cannot read — nothing is silently lost, but nothing is silently
> recovered either.

For off-machine copies, ship the whole backup directory elsewhere with a cron
job:

```bash
# Daily copy at 2 AM of the scheduler's paired snapshots
0 2 * * * rsync -a /path/to/backups/ /offsite/broadcastokr-backups/
```

### Manual Backup

```bash
# Via API — a fresh online snapshot, connections included
curl -H "Authorization: Bearer <KEY>" http://bridge:3001/api/sync/backup -o backup.db

# Or copy the file directly (stop the bridge first, or use the API for a consistent .db)
cp bridge/broadcastokr.db backups/broadcastokr-$(date +%Y%m%d).db
```

### Restore

1. Stop the bridge
2. Replace `broadcastokr.db` with the snapshot's `.db`. Restoring a pre-0.9.2
   pair: put its `.config.json` at `BRIDGE_CONFIG_PATH` as `config.json` too —
   the first start imports it (see Updating)
3. Make sure the encryption key the snapshot was written under is configured
   (server: `BRIDGE_ENCRYPTION_KEY`; desktop: the same machine and account, or
   plan to re-enter passwords)
4. Start the bridge and read its startup lines: it reports how many stored
   passwords it re-encrypted, left unprotected, or cannot read with the key it has

## Credentials

WHATS'ON connections (and Dashboard KPI definitions) are rows in the tenant
database — `connections` and `kpi_definitions`, migration 007 — so they are
migrated, versioned, backed up and tenant-scoped like everything else. There is
no file to edit by hand; the Clients page and `POST /api/connections` are the
write path. A connection that a client, a live KR or a Dashboard KPI still
names cannot be deleted: the API answers `409 connection_in_use` naming them,
and the operator rebinds first.

Database connection passwords are encrypted at rest with AES-256-GCM, under a key
derived (PBKDF2, 100k iterations) from `BRIDGE_ENCRYPTION_KEY`. `BRIDGE_API_KEY`
is accepted as a fallback so existing desktop installs keep working.

```bash
# Generate one (keep it with your secrets, not in the repo)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Without a key:**

| Mode | Behaviour |
|---|---|
| `desktop` | Passwords are stored in the clear. Documented and accepted — single user, single machine. A startup warning names the count. |
| `client` / `cockpit` | `POST /api/connections` refuses a new password with **503**. Existing connections keep working; nothing new is written unprotected. |

Stored ciphertext carries an `enc:v1:` marker, which is what lets the bridge tell
"never encrypted" apart from "encrypted with a key we no longer have". On startup
any unmarked password is re-encrypted in place and the count is logged.

**Upgrading an install that used `BRIDGE_API_KEY` for encryption:** values
written before the marker were encrypted under `BRIDGE_API_KEY`. Keep that
variable set for the first start after adding a dedicated
`BRIDGE_ENCRYPTION_KEY` — the bridge re-wraps the old values under the new key
and logs how many. Without it, the old values are left untouched and reported
as unreadable (they are never re-sealed on a guess), and those passwords must
be re-entered.

**Rotation** is otherwise not automatic. To change the key, re-enter each
connection password after setting the new one. A wrong or missing key fails
loudly rather than handing ciphertext to the database as a password; the count
of unreadable passwords is logged at startup and shown on `/api/health`
(`credentials.unreadable`) and in the Dashboard's System Health panel.

## Identity (OIDC) — client and cockpit modes

Cloud modes fail closed: the bridge refuses to start until `BRIDGE_OIDC_ISSUER`,
`BRIDGE_OIDC_CLIENT_ID`, `BRIDGE_OIDC_CLIENT_SECRET` and `BRIDGE_BASE_URL` are set
(`BRIDGE_INSECURE_NO_AUTH=1` is the screaming escape hatch for tests only).
Authorization Code + PKCE, scope `openid profile email`; the redirect URI to
register at the IdP is `<BRIDGE_BASE_URL>/api/auth/callback`. An `http://` issuer
is accepted (local IdPs); anything real should be `https://`.

**Claims used** (`bridge/sessions.cjs` `upsertSsoUser`): `iss` + `sub` identify the
user; `name` (falling back to `email`) becomes the display name; `email` is stored.
`preferred_username` is not used. Verified against Keycloak 26 on 2026-09-03 with no
mapping changes; Entra is the R1b spot-check.

**Roles:** the first SSO sign-in on an instance becomes `owner`; everyone after is
`member` until an owner promotes them (`PUT /api/users/:id`, audited). Sessions are
an httpOnly cookie, 8 h sliding / 7 d absolute; `POST /api/auth/logout` ends one
session only.

**Running an instance:** the bridge only auto-loads `bridge/.env`. Start each
provisioned instance with its own file — `node --env-file=<instance>/.env
bridge/server.cjs` — and read **both** stdout and stderr at startup: the banner is
on stdout, credential warnings on stderr.

## Connector agent

Runs at the customer site, outbound-only, and pushes numeric scalars to the
instance's `/api/agent/ingest`; SQL never crosses the network. Enrolment:

```bash
# on the instance, as owner (15-minute, single-use token)
curl -X POST -b brokr_session=… https://<instance>/api/agents/enrol-token
# at the site
node bridge/agent.cjs enroll --instance https://<instance> --token <T> --name "site" --dir /etc/brokr-agent
node bridge/agent.cjs run --dir /etc/brokr-agent
```

`agent-config.json` (operator-owned) holds `instanceUrl`, `intervalMs`,
`connections` (same shape as the bridge's, `schema` optional) and `bindings` of
`{ krId, connectionId, sql, timeframeDays? }`. The `krId` must exist on the instance
first — unknown ids come back in the ingest response as `unknown`. Passwords may be
plaintext or `enc:v1:` values produced by the bridge's `encrypt()`; set
`AGENT_DATA_KEY` in the agent's environment to unlock them. Identity lives in
`agent-identity.json` (0600 where the filesystem honours it; a no-op on NTFS).
Oracle uses thick mode when an Oracle client is on PATH, thin mode otherwise;
`ORACLE_CLIENT_DIR` pins a client directory. Revoke an agent with
`DELETE /api/agents/:id`.

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

**Upgrading to 0.9.2 or later from an install with `config.json`:** the first
start imports the file's connections and KPI definitions into the database
(existing rows win), records that it did, and renames the file to
`config.json.migrated` — leave it there for one release as your own backup, then
delete it. The import happens once: a `config.json` that appears later is not
read. To see what would be imported without writing anything, start once with
`BRIDGE_CONFIG_IMPORT=dry-run`. Passwords the file held in the clear are sealed
in the same start when `BRIDGE_ENCRYPTION_KEY` is set (see Credentials).

## Security Notes

- `BRIDGE_API_KEY` must be set in production — without it, auth is disabled
- Database passwords in the `connections` table are encrypted when `BRIDGE_ENCRYPTION_KEY` (or the `BRIDGE_API_KEY` fallback) is set
- The bridge only executes SELECT queries against external databases (enforced server-side)
- CORS origins are configurable — set `BRIDGE_CORS_ORIGINS` to match your deployment
