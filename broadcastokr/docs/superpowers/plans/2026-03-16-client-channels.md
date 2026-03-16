# Client-Channel Integration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pull channels from client databases, add client dropdown to goal modal, and replace the static channel selector with an "All Channels" / multi-select scope when a client is selected.

**Architecture:** Add `ClientChannel` type and `channels[]` to `Client`. Add `ChannelScope` type and `channelScope?` to `Goal`. New bridge endpoint `POST /api/channels` queries PSI database. Goal form gets client dropdown that switches channel UI between legacy static dropdown and client-channel mode. Display components use a helper to read channel scope.

**Tech Stack:** React 19, TypeScript, Zustand 5, Express bridge, Oracle/PostgreSQL.

**Spec:** `docs/superpowers/specs/2026-03-16-client-channels-design.md`

---

## Chunk 1: Types, Bridge Endpoint, and Store

### Task 1: Add ClientChannel, ChannelScope types and extend Client/Goal

**Files:**
- Modify: `src/types/index.ts:179-188` (Client interface), `src/types/index.ts:88-98` (Goal interface)

- [ ] **Step 1: Add `ClientChannel` interface**

In `src/types/index.ts`, add before the `Client` interface:

```ts
export interface ClientChannel {
  id: string;
  name: string;
  internalValue?: string;
  channelKind?: string;
  color?: string;
}

export type ChannelScope =
  | { type: 'all' }
  | { type: 'selected'; channelIds: string[] };
```

- [ ] **Step 2: Add `channels` to `Client` interface**

In the existing `Client` interface, add after `sqlOverrides`:

```ts
  channels: ClientChannel[];
```

- [ ] **Step 3: Add `channelScope` to `Goal` interface**

In the existing `Goal` interface, add after `templateId`:

```ts
  channelScope?: ChannelScope;
```

- [ ] **Step 4: Fix all places that create Client objects without `channels`**

Search for all places that construct `Client` objects and add `channels: []`. Key locations:
- `src/pages/ClientsPage.tsx` — in the add client flow
- `src/components/clients/ClientModal.tsx` — in the save handler
- `src/store/__tests__/clients.test.ts` — test fixtures
- `src/utils/importExport.ts` — if clients are parsed from import

- [ ] **Step 5: TypeScript check**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/pages/ClientsPage.tsx src/components/clients/ClientModal.tsx src/store/__tests__/clients.test.ts src/utils/importExport.ts
git commit -m "feat: add ClientChannel, ChannelScope types; extend Client with channels"
```

---

### Task 2: Add bridge `POST /api/channels` endpoint

**Files:**
- Modify: `bridge/server.cjs`

- [ ] **Step 1: Add the endpoint**

Read `bridge/server.cjs`. Add a new endpoint after the `/api/columns` handler. The endpoint queries the PSI database for channel values, trying the channel table first, falling back to transmissions:

```js
// Get channels from a database connection
app.post('/api/channels', async (req, res) => {
  const { connectionId } = req.body;
  if (!connectionId) return res.status(400).json({ error: 'connectionId is required' });

  const config = loadConfig();
  const connConfig = config.connections.find(c => c.id === connectionId);
  if (!connConfig) return res.status(400).json({ error: 'Connection not found' });

  // Try channel table first, fall back to transmissions
  const channelQueries = connConfig.type === 'postgres'
    ? [
        'SELECT DISTINCT ch_id AS id, ch_description AS name, ch_internalvalue AS "internalValue", ch_kind AS "channelKind" FROM psi.psichannel ORDER BY ch_description',
        'SELECT DISTINCT tx_id_channel AS id, tx_id_channel AS name FROM psi.psitransmission ORDER BY tx_id_channel',
      ]
    : [
        'SELECT DISTINCT CH_ID AS id, CH_DESCRIPTION AS name, CH_INTERNALVALUE AS "internalValue", CH_KIND AS "channelKind" FROM PSI.PSICHANNEL ORDER BY CH_DESCRIPTION',
        'SELECT DISTINCT TX_ID_CHANNEL AS id, TX_ID_CHANNEL AS name FROM PSI.PSITRANSMISSION ORDER BY TX_ID_CHANNEL',
      ];

  for (const sql of channelQueries) {
    try {
      const rows = await runQuery(connConfig, sql, {});
      if (rows && rows.length > 0) {
        return res.json(rows.map(r => ({
          id: String(r.id || r.ID),
          name: String(r.name || r.NAME),
          internalValue: r.internalValue || r.INTERNALVALUE || undefined,
          channelKind: r.channelKind || r.CHANNELKIND || undefined,
        })));
      }
    } catch {
      // Try next query
    }
  }

  res.json([]);
});
```

- [ ] **Step 2: Syntax check**

Run: `node -c bridge/server.cjs`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add bridge/server.cjs
git commit -m "feat: add POST /api/channels endpoint with Oracle/PG fallback"
```

---

### Task 3: Add `getChannels` to useBridge hook and wire through App

**Files:**
- Modify: `src/hooks/useBridge.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add `getChannels` method to useBridge**

In `src/hooks/useBridge.ts`, add after the `getConnections` method:

```ts
  const getChannels = useCallback(async (connectionId: string) => {
    return apiFetch<Array<{ id: string; name: string; internalValue?: string; channelKind?: string }>>('/api/channels', {
      method: 'POST',
      body: JSON.stringify({ connectionId }),
    });
  }, []);
```

Add `getChannels` to the return object.

- [ ] **Step 2: Pass `getChannels` to pages in App.tsx**

In `src/App.tsx`, add `getChannels={bridge.getChannels}` to the `GoalsPage` and `ClientsPage` route props.

- [ ] **Step 3: Update GoalsPage and ClientsPage prop interfaces**

Add `getChannels?: (connectionId: string) => Promise<Array<{ id: string; name: string; internalValue?: string; channelKind?: string }>>` to both page prop interfaces.

- [ ] **Step 4: TypeScript check**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useBridge.ts src/App.tsx src/pages/GoalsPage.tsx src/pages/ClientsPage.tsx
git commit -m "feat: add getChannels to bridge hook and wire to pages"
```

---

### Task 4: Update store — materializeTemplate channelScope, deleteClient clears channelScope

**Files:**
- Modify: `src/store/store.ts:213-218` (deleteClient), `src/store/store.ts:249-255` (materializeTemplate)

- [ ] **Step 1: Update `deleteClient` to clear channelScope on unlinked goals**

Change the non-cascade branch (line 218) from:
```ts
: s.goals.map((g) => g.clientId === id ? { ...g, clientId: undefined, templateId: undefined } : g),
```
To:
```ts
: s.goals.map((g) => g.clientId === id ? { ...g, clientId: undefined, templateId: undefined, channelScope: undefined } : g),
```

- [ ] **Step 2: Update `materializeTemplate` to set channelScope**

In the `materializeTemplate` action, where it builds `newGoals.push({...})`, add `channelScope: { type: 'all' as const },` alongside the existing `channel: 0`.

- [ ] **Step 3: TypeScript check**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 4: Commit**

```bash
git add src/store/store.ts
git commit -m "feat: materialize with channelScope, clear on client unlink"
```

---

## Chunk 2: UI — Client Channels and Goal Form

### Task 5: Add Pull Channels to Client page

**Files:**
- Modify: `src/pages/ClientsPage.tsx`
- Modify: `src/components/clients/ClientModal.tsx`

- [ ] **Step 1: Add Pull Channels to ClientsPage**

In `ClientsPage.tsx`:
- Accept `getChannels` prop
- Add a "Pull Channels" / "Refresh Channels" button to each client card (next to Edit/Delete)
- On click: call `getChannels(client.connectionId)`, assign colors from a preset palette (`const CHANNEL_PALETTE = ['#3805E3', '#2DD4BF', '#F59E0B', '#F87171', '#60A5FA', '#A78BFA', '#FB923C', '#34D399', '#F472B6', '#818CF8']`), then call `updateClient(client.id, { channels: results.map((ch, i) => ({ ...ch, color: CHANNEL_PALETTE[i % CHANNEL_PALETTE.length] })) })`
- Show toast with channel count on success, error toast on failure
- Show channel count badge on client cards (e.g., "8 channels")

- [ ] **Step 2: Add channel preview to ClientModal**

In `ClientModal.tsx`:
- Show a read-only "Channels" section at the bottom when editing a client that has channels
- Display channels as `PillBadge` pills with their assigned colors
- Show "No channels loaded — save client first, then use Pull Channels" if empty

- [ ] **Step 3: TypeScript check**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 4: Commit**

```bash
git add src/pages/ClientsPage.tsx src/components/clients/ClientModal.tsx
git commit -m "feat: add Pull Channels button and channel preview to Client page"
```

---

### Task 6: Add client dropdown and channel scope to Goal form

**Files:**
- Modify: `src/components/goals/GoalFormFields.tsx`
- Modify: `src/pages/GoalsPage.tsx`

- [ ] **Step 1: Extend GoalFormFields props and add client/channel scope UI**

In `src/components/goals/GoalFormFields.tsx`:

Add to the props interface:
```ts
  clients?: Client[];
  selectedClientId?: string;
  setSelectedClientId?: (v: string) => void;
  channelScopeType?: 'all' | 'selected';
  setChannelScopeType?: (v: 'all' | 'selected') => void;
  selectedChannelIds?: string[];
  setSelectedChannelIds?: (v: string[]) => void;
  onPullChannels?: (connectionId: string) => Promise<void>;
```

Add imports for `Client`, `ClientChannel`, `ChannelScope` from types.

In the form JSX, add above the existing channel dropdown:

**Client dropdown** (only shows if `clients` prop is provided and has items):
```tsx
{clients && clients.length > 0 && (
  <div style={{ marginBottom: 12 }}>
    <label style={labelStyle}>Client</label>
    <select value={selectedClientId || ''} onChange={...} style={selectStyle}>
      <option value="">No client (internal goal)</option>
      {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  </div>
)}
```

**Channel section** — conditional on client selection:
- If no client selected: render existing static `CHANNELS` dropdown (unchanged)
- If client selected:
  - Two radio buttons: "All Channels" and "Select Channels"
  - When "Select Channels": render checkbox list of `selectedClient.channels[]` with search filter
  - Each channel shows as a checkbox with name and color dot
  - At least one must be checked (show validation message if none)
  - "Select All" / "Deselect All" links
  - If `selectedClient.channels` is empty: show "No channels loaded" with "Pull Channels" button

- [ ] **Step 2: Wire client/channel state in GoalsPage**

In `src/pages/GoalsPage.tsx`:

Add state for the new fields:
```ts
const [newClientId, setNewClientId] = useState('');
const [newChannelScopeType, setNewChannelScopeType] = useState<'all' | 'selected'>('all');
const [newSelectedChannelIds, setNewSelectedChannelIds] = useState<string[]>([]);
```

Same for edit state (`editClientId`, etc.).

Pass these to `GoalFormFields` in both create and edit modals.

When saving a goal:
- If `newClientId` is set: set `goal.clientId = newClientId` and `goal.channelScope = newChannelScopeType === 'all' ? { type: 'all' } : { type: 'selected', channelIds: newSelectedChannelIds }`
- If no client: set `goal.channel = selectedChannelIndex` (legacy, no channelScope)

Add `getChannels` prop and implement `handlePullChannels` that calls `getChannels`, assigns palette colors, and updates the client in the store.

- [ ] **Step 3: TypeScript check**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 4: Commit**

```bash
git add src/components/goals/GoalFormFields.tsx src/pages/GoalsPage.tsx
git commit -m "feat: add client dropdown and channel scope to goal form"
```

---

### Task 7: Update channel display across the app

**Files:**
- Create: `src/utils/channelDisplay.ts`
- Modify: `src/pages/GoalsPage.tsx` (goal cards)
- Modify: `src/pages/DashboardPage.tsx` (channel health section)
- Modify: `src/pages/ComparePage.tsx` (channel info in grid)

- [ ] **Step 1: Create channel display helper**

Create `src/utils/channelDisplay.ts`:

```ts
import { CHANNELS } from '../constants';
import type { Goal, Client } from '../types';

export interface ChannelDisplayInfo {
  label: string;
  channels: Array<{ name: string; color: string }>;
}

/** Get display info for a goal's channel scope */
export function getGoalChannelDisplay(goal: Goal, clients: Client[]): ChannelDisplayInfo {
  if (goal.channelScope) {
    const client = clients.find(c => c.id === goal.clientId);
    if (goal.channelScope.type === 'all') {
      return {
        label: 'All Channels',
        channels: client?.channels.map(ch => ({ name: ch.name, color: ch.color || client.color })) || [],
      };
    }
    if (goal.channelScope.type === 'selected') {
      const selected = goal.channelScope.channelIds;
      const chs = (client?.channels || []).filter(ch => selected.includes(ch.id));
      return {
        label: chs.map(c => c.name).join(', '),
        channels: chs.map(ch => ({ name: ch.name, color: ch.color || client?.color || '#888' })),
      };
    }
  }
  // Legacy: use static CHANNELS array
  const ch = CHANNELS[goal.channel];
  return {
    label: ch?.name || 'Unknown',
    channels: ch ? [{ name: ch.name, color: ch.color }] : [],
  };
}
```

- [ ] **Step 2: Update goal cards in GoalsPage**

In the goal card rendering section, replace the existing `ChannelBadge` usage for goals that have `channelScope`:
- If `goal.channelScope` exists: render `PillBadge` with `getGoalChannelDisplay()` result
- If no `channelScope`: keep existing `ChannelBadge` (legacy)

- [ ] **Step 3: Update DashboardPage channel health**

In the channel health section, add a note that client-scoped goals are excluded (they appear in the Compare page instead). The existing filter `g.channel === ci` naturally excludes client-scoped goals since they use `channel: 0` which would incorrectly group them — add a guard: `goals.filter(g => !g.channelScope && g.channel === ci)`.

- [ ] **Step 4: Update ComparePage**

In the Compare page grid, add channel scope info to client rows. After the client name, show the goal's channel scope as small text (e.g., "All Channels" or "VRT1, Canvas").

- [ ] **Step 5: TypeScript check**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 6: Commit**

```bash
git add src/utils/channelDisplay.ts src/pages/GoalsPage.tsx src/pages/DashboardPage.tsx src/pages/ComparePage.tsx
git commit -m "feat: channel scope display across goal cards, dashboard, compare"
```

---

## Chunk 3: Import/Export and Final Integration

### Task 8: Update import/export for channelScope

**Files:**
- Modify: `src/utils/importExport.ts`

- [ ] **Step 1: Update JSON export/import**

`channelScope` on Goal is a regular serializable field — JSON export/import handles it automatically. No JSON changes needed.

- [ ] **Step 2: Update CSV/Excel export**

In the CSV and Excel export functions, add a "Channel Scope" column. Use `getGoalChannelDisplay` to produce the display string. Import `getGoalChannelDisplay` from `../utils/channelDisplay` and `clients` from the store (passed as parameter).

Add a `clients` parameter to the CSV/Excel export functions and use it to resolve channel display.

- [ ] **Step 3: TypeScript check**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 4: Commit**

```bash
git add src/utils/importExport.ts
git commit -m "feat: add channel scope column to CSV/Excel export"
```

---

### Task 9: Final verification

- [ ] **Step 1: TypeScript check**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 2: Manual test**

1. Go to Clients page → add a client with a connection
2. Click "Pull Channels" → verify channels appear as pills on the card
3. Go to Goals → create a new goal → select the client → verify channel UI switches to All/Select mode
4. Select "Select Channels" → pick 2 channels → save
5. Verify goal card shows the selected channels as pills
6. Edit the goal → change to "All Channels" → save → verify display updates
7. Create a goal without a client → verify legacy static channel dropdown still works
8. Check Dashboard → channel health section excludes client-scoped goals
9. Check Compare page → verify channel scope shows in client rows
10. Delete client (unlink) → verify goal loses channelScope

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: complete client-channel integration"
```
