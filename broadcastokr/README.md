# BroadcastOKR

Broadcast Operations OKR Management Platform for VRT/Mediagenix WHATS'ON environments. Manages Goals (OKRs), Tasks, KPIs, and live database-backed Key Results via a bridge service.

## Features

- **Goals & OKRs** — Create goals with key results, track progress, set targets
- **Live Key Results** — Connect KRs to Oracle/PostgreSQL databases for automatic value sync
- **Multi-Client** — Manage multiple broadcast clients with per-client goal templates
- **Task Management** — Kanban board with priorities, assignments, and subtasks
- **Reporting** — Three-view reports (by client, by goal, by KR template) with sparklines and trends
- **KR History** — Check-in with confidence ratings and notes, monitoring mode for automated tracking
- **Team Management** — Users, teams, roles (Owner/Manager/Member)

## Architecture

```
[Electron App]          [Electron App]
   Zustand cache           Zustand cache
       |                       |
       +-----------+-----------+
                   |
         [Shared Bridge Server]
           Express.js + SQLite
           API key auth, request logging
                   |
         [broadcastokr.db]  [config.json]
                   |
         [Oracle/PostgreSQL WHATS'ON databases]
```

- **Frontend:** React 19, TypeScript 5.9, Vite 7, Zustand 5
- **Desktop:** Electron 41
- **Bridge:** Express.js, SQLite (better-sqlite3), optional Oracle/PostgreSQL drivers

## Prerequisites

- Node.js 22+
- npm 10+
- Optional: Oracle Instant Client (for Oracle DB connections)

## Quick Start

```bash
# Clone and install
git clone https://github.com/PolycarpusTack/BroadcastOKR.git
cd BroadcastOKR/broadcastokr
npm install

# Start development
npm run dev          # Vite dev server at http://localhost:5173
npm run bridge       # Bridge service at http://localhost:3001

# Or run as Electron app
npm run electron:dev
```

## Bridge Setup

The bridge service connects the frontend to databases and provides the shared SQLite data store.

### Environment Variables

Copy `bridge/.env.example` to `bridge/.env` and configure:

| Variable | Default | Description |
|----------|---------|-------------|
| `BRIDGE_PORT` | `3001` | Server port |
| `BRIDGE_HOST` | `0.0.0.0` | Bind address |
| `BRIDGE_API_KEY` | (required) | Authentication token |
| `BRIDGE_DB_PATH` | `./broadcastokr.db` | SQLite database path |
| `BRIDGE_LOG_DIR` | `./logs` | Log file directory |
| `BRIDGE_BACKUP_DIR` | `./backups` | Backup directory |
| `BRIDGE_CORS_ORIGINS` | `localhost:5173,localhost:3000` | Allowed CORS origins |
| `ORACLE_CLIENT_DIR` | (none) | Oracle Instant Client path |

### Docker Deployment

```bash
# From repo root
cp broadcastokr/bridge/.env.example broadcastokr/bridge/.env
# Edit .env with your BRIDGE_API_KEY

docker compose up -d
```

### Database Connections

1. Start the bridge: `npm run bridge`
2. Open the app and go to Clients
3. Add a client with a database connection
4. Test the connection before saving

## Testing

```bash
npm test              # Frontend tests (Vitest)
npm run test:bridge   # Bridge tests (Node test runner)
npx tsc --noEmit      # TypeScript check
```

## Building

```bash
npm run build                    # Web build to dist/
npm run electron:build           # Windows installer
npm run electron:build:linux     # Linux AppImage
```

## License

Internal use only — VRT/Mediagenix.
