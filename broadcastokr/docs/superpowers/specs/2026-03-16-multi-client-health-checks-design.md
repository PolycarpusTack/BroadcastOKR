# Multi-Client Health Check Design

## Problem

BroadcastOKR needs to evaluate the same Health Check goals (e.g., "Long Term Planning") across 15+ client databases simultaneously. Each client has their own hosted test database (Oracle or PostgreSQL) with PSI/WHATS'ON schema. About 85% of schemas are identical; the remainder have client-specific tables or columns requiring SQL tweaks.

Users need two views: a comparison dashboard showing all clients side-by-side for a given health check, and per-client detail showing a client's full health check profile.

## Data Model

### Client

New entity representing a customer deployment.

```ts
interface Client {
  id: string;            // e.g., "vrt", "rtbf"
  name: string;          // "VRT"
  connectionId: string;  // links to existing bridge DB connection
  logo?: string;         // optional avatar/icon path
  color: string;         // for charts, badges — auto-assigned from palette, warn on duplicate
  tags?: string[];       // e.g., ["tier-1", "europe", "oracle"]
  sqlOverrides?: Record<string, Record<string, string>>; // templateId → { krTemplateId → custom SQL }
}
```

Note: `sqlOverrides` is keyed by `templateId` then `krTemplateId` to avoid collisions between KR IDs across different templates.

### Goal Template

Defines a reusable Health Check goal with KR query definitions.

```ts
interface GoalTemplate {
  id: string;
  title: string;           // "HC - Long Term Planning"
  category: string;        // "Health Check", "Operational", etc.
  period: string;          // format matches existing Goal.period, e.g., "Q1 2026"
  syncIntervalMs?: number; // override default poll interval per template
  krTemplates: KRTemplate[];
}

interface KRTemplate {
  id: string;             // UUID, globally unique
  title: string;          // "Rights Coverage"
  sql: string;            // default SQL query
  unit: string;           // "%", "days", etc.
  direction: 'hi' | 'lo';
  start: number;
  target: number;
  timeframeDays?: number; // controls SQL date range via :start_date/:end_date binds
}
```

Note: `syncIntervalMs` controls how often queries run. `timeframeDays` controls the SQL query's date window. These are independent concerns.

### KeyResult ID Addition

The existing `KeyResult` interface gains an `id` field:

```ts
interface KeyResult {
  id: string;            // NEW — UUID, used for template-to-goal KR matching
  // ...existing fields unchanged
  krTemplateId?: string; // NEW — links back to KRTemplate for sync matching
}
```

This is a **breaking change** to the existing type. Migration: on store rehydration, any KR without an `id` gets one generated via `crypto.randomUUID()`. Existing KRs created before this feature will have `id` but no `krTemplateId`.

### Goal Extensions

Existing `Goal` type gains two optional fields:

```ts
interface Goal {
  // ...existing fields
  clientId?: string;     // links to Client
  templateId?: string;   // links to GoalTemplate (for sync)
}
```

Materialized goals are regular Goal objects. Each KR gets:
- `liveConfig.connectionId` → client's `connectionId`
- `liveConfig.sql` → template's default SQL, or client's override from `sqlOverrides[templateId][krTemplateId]`
- `krTemplateId` → the KRTemplate ID for sync matching
- `owner` → defaults to current authenticated user at time of materialization
- `channel` → defaults to 0 (first channel); can be overridden per-client in future

### Deletion Behavior

**Deleting a Client:**
- Prompt: "Delete client and all its health check goals, or keep goals as standalone?"
- Option A (default): cascade-delete all goals where `clientId` matches
- Option B: unlink — clear `clientId` and `templateId` on matching goals, converting them to standalone goals
- Also remove the client from all `sqlOverrides` references

**Deleting a Goal Template:**
- Prompt: "Delete template and all materialized goals, or keep goals as standalone?"
- Option A (default): cascade-delete all goals where `templateId` matches
- Option B: unlink — clear `templateId` on matching goals, converting them to standalone

### Store Changes

New top-level Zustand slices alongside existing `goals`, `tasks`, `kpis`:

```ts
interface AppStore {
  // ...existing
  clients: Client[];
  goalTemplates: GoalTemplate[];

  addClient: (client: Client) => void;
  updateClient: (id: string, updates: Partial<Omit<Client, 'id'>>) => void;
  deleteClient: (id: string, cascade: boolean) => void;

  addGoalTemplate: (template: GoalTemplate) => void;
  updateGoalTemplate: (id: string, updates: Partial<Omit<GoalTemplate, 'id'>>) => void;
  deleteGoalTemplate: (id: string, cascade: boolean) => void;

  materializeTemplate: (templateId: string, clientIds: string[]) => void;
  syncTemplateToGoals: (templateId: string) => void;
}
```

**`materializeTemplate` idempotency:** Before creating goals, checks for existing goals with matching `clientId + templateId`. Already-materialized clients are skipped with a toast notification ("3 clients skipped — already materialized"). Only new client-template pairs create goals.

**`syncTemplateToGoals` matching:** Uses `krTemplateId` on each KeyResult to match template KRs to materialized goal KRs (not array index). This handles KR reordering and deletion safely. KRs in the goal that have no matching `krTemplateId` in the template are left untouched. New KRs from the template are appended.

All persisted via the existing Zustand `persist` middleware to localStorage.

## UI: Clients Page

New page in sidebar navigation (between Team and Reports).

### Client List

- Grid of client cards showing: name, color dot, connection name, tag pills, connection health indicator, count of active templates
- Search/filter bar (required for 15+ clients): text search + tag filter
- "Add Client" button
- Connection health: checked once on page mount via `/api/test-connection`, shows green/red/gray dot

### Add/Edit Client Modal

- Name, color picker (auto-suggests from palette, warns on duplicate), connection dropdown (from existing bridge connections)
- Tags input (comma-separated or pill-based)
- SQL Overrides section: lists active templates with their KR queries. Each KR shows default SQL with an "Override" toggle revealing a SQL editor for that client's custom query. Only used by ~15% of clients.

## UI: Goal Templates

### Templates View

Toggle on the Goals page header: **Goals | Templates**

- List of goal template cards with KR definitions
- "Create Template" opens a form similar to goal creation but without client/connection picker — only SQL, unit, direction, start, target
- Each template card shows: active client count, "Materialize" button, "Edit" button

### Materialization Flow

"Materialize" button opens a modal:

- Searchable checkbox list of all clients
- Already-materialized clients shown as disabled/checked with "(active)" label
- "Select All" / "Select by tag" shortcuts
- Preview column showing which clients have SQL overrides for this template
- Confirm → creates one Goal per selected client, each with Live KRs wired to that client's connection and the template's SQL (or override)

### Template-to-Goal Sync

When editing a template's SQL or adding a KR:

- Prompt: "Update all materialized goals?"
- If confirmed: patches existing goals using `krTemplateId` matching, preserving `current`/`progress` values
- Clients with SQL overrides for the changed KR are skipped and flagged for manual review
- New KRs are appended to all materialized goals
- Deleted KRs are removed from all materialized goals (with confirmation)

### Goals View Enhancements

- New "Client" filter dropdown (searchable, shows client name + color dot)
- Template-sourced goals show a small template icon badge
- Existing goal functionality unchanged for non-template goals

## UI: Comparison Dashboard

New **Compare** page accessible from sidebar.

### Layout

- Template selector dropdown at top
- Table/grid: clients as rows, KRs as columns
- Each cell: current value, status badge (on_track/at_risk/behind), sparkline trend
- Summary row at top: fleet-wide averages per KR

### UI States

- **No templates exist**: empty state with "Create your first Health Check template" CTA linking to Goals → Templates
- **No template selected**: prompt to select a template from the dropdown
- **Template selected but no materialized goals**: "No clients evaluated yet. Click Materialize on the Goals → Templates page."
- **Partial errors**: cells with `syncStatus: 'error'` show a red indicator with error tooltip; healthy cells render normally
- **Bridge offline**: banner at top "Bridge offline — data may be stale", cells show last-known values with stale indicator

### Interactions

- Click cell → navigate to that client's Goal detail on Goals page
- Click client name → filter Goals page to that client
- Sort by any column (ascending/descending)
- Filter by client tag
- "Sync All" button → batch-syncs all materialized goals for the selected template

## Sync & Performance

### Existing Infrastructure

Materialized goals are regular `Goal` objects with `liveConfig`. The existing 15-minute auto-sync timer picks them up automatically — no new sync infrastructure needed.

The bridge's `/api/kpi/execute-batch` endpoint currently runs queries sequentially. Per-query timeout is 15 seconds.

### Prerequisite: Parallel Batch Execution

At 15+ clients × 5 KRs = 75+ queries per cycle, sequential execution (worst case 75 × 15s = 18+ minutes) exceeds the sync interval. The bridge must be updated to run batch queries concurrently:

```js
// Replace sequential for...of with concurrent execution
const results = await Promise.allSettled(
  queries.map(q => Promise.race([runQuery(...), timeout(15000)]))
);
```

Add a concurrency limiter (e.g., 10 concurrent queries) to avoid exhausting database connection pools. This is a bridge-only change with no frontend impact.

### Scale Considerations

- 15 clients × 5 KRs = 75 queries per sync cycle: ~8 seconds with 10-concurrent limiter
- 30 clients × 10 KRs = 300 queries: ~45 seconds with 10-concurrent limiter
- Per-template `syncIntervalMs` allows different poll frequencies for different health checks
- Bridge connection pooling reuses connections per client database

## Import/Export

The existing import/export system (`src/utils/importExport.ts`) must be extended:

- **Export**: include `clients` and `goalTemplates` arrays alongside `goals`, `tasks`, `kpis`
- **Import**: if `clients` or `goalTemplates` keys are missing (importing from pre-feature data), default to empty arrays
- Validate `clientId`/`templateId` references on import; warn about dangling references

## File Structure

New files:

```
src/types/index.ts              — add Client, GoalTemplate, KRTemplate types
src/store/store.ts              — add clients/templates slices and actions
src/pages/ClientsPage.tsx       — client management page
src/pages/ComparePage.tsx       — comparison dashboard
src/components/clients/         — ClientCard, ClientModal, SqlOverrideEditor
src/components/templates/       — TemplateCard, TemplateForm, MaterializeModal
```

Modified files:

```
src/types/index.ts              — Goal gets clientId/templateId; KeyResult gets id/krTemplateId
src/store/store.ts              — KR id migration on rehydration
src/pages/GoalsPage.tsx         — add Templates toggle, Client filter
src/components/layout/Sidebar.tsx — add Clients, Compare nav items
src/App.tsx                     — add routes for /clients, /compare
src/utils/importExport.ts       — include clients/templates in import/export
bridge/server.cjs               — parallelize execute-batch with concurrency limiter
```

## Out of Scope

- Client authentication/authorization (single-user desktop app)
- Real-time WebSocket sync (polling is sufficient)
- Custom per-client KR targets (all clients share template targets initially)
- Export/reporting across clients (future enhancement)
