# Client-Channel Integration Design

## Problem

Goals currently use a static channel list (`src/constants/channels.ts`) with a numeric index. With the multi-client feature, channels should be client-specific — pulled from each client's PSI database. Users need to scope goals to "All Channels" or a multi-select of specific channels for a given client.

Additionally, database connection configuration should live on the Client entity rather than being managed separately, making the Client the single owner of its database relationship.

## Data Model

### ClientChannel

New type representing a channel pulled from a client's database.

```ts
interface ClientChannel {
  id: string;             // DB identifier (external reference or CH_ID)
  name: string;           // display name (e.g., "VRT1", "Canvas")
  internalValue?: string; // WHATS'ON internal value
  channelKind?: string;   // "Linear", "On demand", etc.
  color?: string;         // auto-assigned from a preset palette based on index
}
```

Note: `color` is assigned client-side from a preset palette when channels are pulled (not from the database). This allows `ChannelBadge`-style rendering. Channels without a color fall back to the client's color.

### Client Extension

Add `channels` array to the existing `Client` interface:

```ts
interface Client {
  // ...existing fields (id, name, connectionId, color, tags, sqlOverrides)
  channels: ClientChannel[];  // populated via bridge query
}
```

Channels default to `[]` and are populated when the user clicks "Pull Channels" or on client creation if the bridge is connected.

### ChannelScope

New type for goal channel selection:

```ts
type ChannelScope =
  | { type: 'all' }                            // all channels for the client
  | { type: 'selected'; channelIds: string[] }  // specific channels (multi-select, min 1)
```

Validation: `selected` type requires at least one `channelId`. The form disables save when "Select Channels" is chosen but no channels are checked.

### Goal Changes

```ts
interface Goal {
  // ...existing fields
  channel: number;            // KEPT for backward compat, used by legacy goals
  channelScope?: ChannelScope; // NEW — if present, this goal uses client channels
  clientId?: string;
  templateId?: string;
}
```

**Reading channel info**: UI helper function `getGoalChannelDisplay(goal, clients, CHANNELS)`:
- If `channelScope` is present and `channelScope.type === 'all'` → return "All Channels"
- If `channelScope` is present and `channelScope.type === 'selected'` → look up channel names from `client.channels`, return as list
- If no `channelScope` → fall back to `CHANNELS[goal.channel]` (legacy static channel)

### Migration

No store migration needed. Existing goals keep `channel: number` without `channelScope`. The helper function handles both paths.

### Dashboard & Reports Channel Aggregation

The Dashboard channel health and Reports channel compliance sections currently iterate `CHANNELS` and filter by `g.channel === index`. With this change:

- Legacy goals (no `channelScope`) continue to appear in static channel aggregations as before
- Client-scoped goals (`channelScope` present) are **excluded** from the static channel health grid — they belong to client-specific channels, not the static app channels
- The Dashboard already has the LiveKPIPanel and Compare page for client-scoped data; the static channel health grid serves non-client goals only

This is a clean separation: static channels for internal/non-client goals, client channels for health-check goals.

### Task.channel

Tasks continue to use `channel: number` with the static `CHANNELS` array. Tasks are operational items not tied to client databases. Aligning tasks to client channels is out of scope for this feature — tasks and goals serve different purposes in the app.

## Bridge Changes

### New Endpoint: `POST /api/channels`

Accepts: `{ connectionId: string }`

Returns: `ClientChannel[]` (without `color` — color is assigned client-side)

Query strategy (try in order):
1. **Channel table** (Oracle): `SELECT DISTINCT CH_ID as id, CH_DESCRIPTION as name, CH_INTERNALVALUE as "internalValue", CH_KIND as "channelKind" FROM PSI.PSICHANNEL ORDER BY CH_DESCRIPTION`
2. **Channel table** (PostgreSQL): `SELECT DISTINCT ch_id as id, ch_description as name, ch_internalvalue as "internalValue", ch_kind as "channelKind" FROM psi.psichannel ORDER BY ch_description`
3. **Fallback** — discover from transmissions: `SELECT DISTINCT TX_ID_CHANNEL as id, TX_ID_CHANNEL as name FROM PSI.PSITRANSMISSION ORDER BY TX_ID_CHANNEL`

The bridge tries the channel table first. If it fails (table doesn't exist), falls back to the transmission table.

The SELECT-only guard in `runQuery` already covers this endpoint.

## UI: Goal Modal Changes

### Client Dropdown

Added to the goal creation/edit form, above the channel section:
- `<select>` listing all clients from the store (name + color dot)
- Optional — can be left blank for non-client goals (backward compatible)
- When a client is selected, the channel section switches from static dropdown to client-channel mode

### Channel Section

**When no client selected (legacy mode):**
- Existing static channel dropdown (from `src/constants/channels.ts`)
- Sets `goal.channel = selectedIndex` (no `channelScope`)

**When a client is selected:**
- Two radio buttons: "All Channels" (default) and "Select Channels"
- "All Channels" → sets `channelScope: { type: 'all' }`
- "Select Channels" → reveals checkbox list of `client.channels[]`
  - Search filter for 15+ channels
  - Select All / Deselect All shortcuts
  - At least one channel must be selected (save disabled otherwise)
  - Sets `channelScope: { type: 'selected', channelIds: [...] }`
- If `client.channels` is empty, show "No channels loaded" with a "Pull Channels" button that calls the bridge endpoint and saves to the client

### Channel Display

New display component or extended `ChannelBadge` logic:
- `channelScope.type === 'all'` → `PillBadge` with "All Channels" label, using client's color
- `channelScope.type === 'selected'` → `PillBadge` per channel (name from `client.channels`, color from `channel.color` or client color)
- No `channelScope` → existing `ChannelBadge` using `CHANNELS[goal.channel]` (has color, icon, name)

For selected channels, use `PillBadge` (already used throughout the app) rather than `ChannelBadge`, since client channels don't have icons. Use the channel's auto-assigned color or fall back to the client's color.

## UI: Client Page Changes

### Pull Channels

On the Client page / Client modal:
- "Pull Channels" button (or "Refresh Channels" if channels already loaded)
- Calls `POST /api/channels` with the client's `connectionId`
- On success: assigns colors from a preset palette, updates `client.channels` in the store, shows toast with count
- On failure: shows error toast
- Auto-pull option: when creating a new client and bridge is connected, auto-pull after save

### Channel Preview

Client cards show channel count badge (e.g., "12 channels"). Client modal shows the loaded channel list as read-only pills in a section below the connection config.

### Client Deletion

When a client is deleted without cascade (goals become standalone), `channelScope` is cleared on orphaned goals to prevent dangling channel references. The goals revert to `channel: 0` (first static channel) as a safe default.

## useBridge Hook Extension

Add a new method to the `useBridge` hook:

```ts
const getChannels = useCallback(async (connectionId: string) => {
  return apiFetch<ClientChannel[]>('/api/channels', {
    method: 'POST',
    body: JSON.stringify({ connectionId }),
  });
}, []);
```

Export from the hook return. Pass through `App.tsx` to `ClientsPage` and `GoalsPage`.

## Template Interaction

When materializing a Goal Template for a client:
- The materialized goal gets `channelScope: { type: 'all' }` and `channel: 0` (safe default for any legacy code paths)
- Templates could optionally specify a channel scope, but this is out of scope for now

## Import/Export

- JSON export includes `channelScope` on goals (it's a regular field, serialized automatically)
- JSON import: goals with `channelScope` are imported as-is. The existing `migrateKRIds` handles KR IDs; no separate channel migration needed.
- CSV/Excel export: add a "Channel Scope" column that shows "All Channels", comma-separated channel names, or the static channel name for legacy goals

## File Changes

**New types** (in `src/types/index.ts`):
- `ClientChannel` interface
- `ChannelScope` type
- `channels: ClientChannel[]` added to `Client`
- `channelScope?: ChannelScope` added to `Goal`

**Bridge** (`bridge/server.cjs`):
- New `POST /api/channels` endpoint with Oracle/PostgreSQL channel queries + fallback

**Hook** (`src/hooks/useBridge.ts`):
- Add `getChannels` method

**Store** (`src/store/store.ts`):
- `materializeTemplate` sets `channelScope: { type: 'all' }` and `channel: 0` on created goals
- `deleteClient` without cascade: clears `channelScope` on orphaned goals

**Goal form** (`src/components/goals/GoalFormFields.tsx` or `src/pages/GoalsPage.tsx`):
- Client dropdown
- Channel scope selector (All / Select with multi-checkbox)

**Client page** (`src/pages/ClientsPage.tsx`, `src/components/clients/ClientModal.tsx`):
- Pull Channels button + channel preview + color assignment

**Display components** (goal cards, Compare page):
- New `getGoalChannelDisplay()` helper
- Use `PillBadge` for client channel display, `ChannelBadge` for legacy

**App.tsx**:
- Pass `getChannels` from bridge to pages that need it

**Import/Export** (`src/utils/importExport.ts`):
- Include `channelScope` in JSON export (automatic)
- Add "Channel Scope" column to CSV/Excel export

## Out of Scope

- Channel groups (WHATS'ON has channel groups — future enhancement)
- Per-channel KR targets (all KRs apply to the goal's channel scope uniformly)
- Channel-level comparison in the Compare page (compares by client, not by channel within a client)
- Task.channel alignment with client channels (tasks use static channels, different purpose)
- Auto-refresh channels on bridge reconnect (manual "Refresh Channels" button is sufficient)
