# BroadcastOKR Bridge API

REST API for the BroadcastOKR bridge service. Provides database proxy, entity CRUD, and data sync.

## Authentication

All endpoints except `GET /api/health` require an API key:

```
Authorization: Bearer <BRIDGE_API_KEY>
```

Set `BRIDGE_API_KEY` in your `.env` file. Auth is disabled when the key is not set (development mode).

## Endpoints

### Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Service status, uptime, DB stats, driver availability |

### Sync

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/sync/state` | Full state snapshot (all entities) |
| GET | `/api/sync/changes?since=<ISO>` | Entities changed since timestamp |
| POST | `/api/sync/migrate-from-local` | Import localStorage data (one-time migration) |
| GET | `/api/sync/backup` | Download SQLite database file |

### Goals

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/goals` | List all goals with nested key results and history |
| GET | `/api/goals/:id` | Get single goal |
| POST | `/api/goals` | Create goal |
| PUT | `/api/goals/:id` | Update goal (upserts key results) |
| DELETE | `/api/goals/:id` | Delete goal (cascades to KRs and history) |
| POST | `/api/goals/:id/check-in` | Record KR check-in |

**Check-in body:**
```json
{
  "krId": "kr-uuid",
  "value": 42,
  "confidence": "on_track",
  "note": "Looking good",
  "actor": "alice"
}
```

### Tasks

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/tasks` | List all tasks with subtasks |
| POST | `/api/tasks` | Create task |
| PUT | `/api/tasks/:id` | Update task (upserts subtasks) |
| DELETE | `/api/tasks/:id` | Delete task |

### Clients

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/clients` | List all clients |
| POST | `/api/clients` | Create client |
| PUT | `/api/clients/:id` | Update client |
| DELETE | `/api/clients/:id` | Delete client |

### Templates

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/templates` | List goal templates with KR templates |
| POST | `/api/templates` | Create template |
| PUT | `/api/templates/:id` | Update template (upserts KR templates) |
| DELETE | `/api/templates/:id` | Delete template |

### Users

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/users` | List all users |
| POST | `/api/users` | Create user |
| PUT | `/api/users/:id` | Update user |
| DELETE | `/api/users/:id` | Delete user |

### Teams

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/teams` | List teams with members |
| POST | `/api/teams` | Create team |
| PUT | `/api/teams/:id` | Update team (replaces members) |
| DELETE | `/api/teams/:id` | Delete team |

### Database Proxy (read-only)

| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/api/config` | Bridge configuration |
| POST/GET/DELETE | `/api/connections` | Database connection CRUD |
| POST | `/api/test-connection` | Test a database connection |
| POST | `/api/tables` | List tables in a connection |
| POST | `/api/columns` | List columns for a table |
| POST | `/api/channels` | Get broadcast channels from DB |
| POST | `/api/preview-query` | Execute preview SQL (20 row limit) |
| POST | `/api/kpi/execute-batch` | Batch execute KR queries |
| GET | `/api/kpi/poll` | Poll all KPI definitions |

### Error Response

All errors follow the format:
```json
{ "error": "Error description" }
```

Status codes: 400 (bad request), 401 (unauthorized), 404 (not found), 500 (internal error).
