import { useState } from 'react';
import { Modal } from '../ui/Modal';
import type { Theme } from '../../types';
import { PRIMARY_COLOR, COLOR_WARNING, FONT_MONO } from '../../constants/config';

interface DeveloperGuideModalProps {
  open: boolean;
  onClose: () => void;
  theme: Theme;
}

interface Chapter {
  id: string;
  title: string;
  body: () => React.ReactNode;
}

// O'Reilly-style serif stack for this guide only — the deliberate visual
// contrast with the For-Dummies HelpModal signals "reference, not tutorial".
const SERIF = 'Georgia, "Times New Roman", serif';

export function DeveloperGuideModal({ open, onClose, theme }: DeveloperGuideModalProps) {
  const [active, setActive] = useState('setup');

  // ---- O'Reilly-flavored inline helpers ----
  const H = ({ children }: { children: React.ReactNode }) => (
    <div style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 700, color: theme.text, marginBottom: 4 }}>{children}</div>
  );
  const Rule = () => (
    <div style={{ height: 2, background: PRIMARY_COLOR, width: 48, margin: '0 0 14px' }} />
  );
  const P = ({ children }: { children: React.ReactNode }) => (
    <p style={{ fontSize: 13.5, lineHeight: 1.7, color: theme.textMuted, margin: '0 0 12px' }}>{children}</p>
  );
  const Sub = ({ children }: { children: React.ReactNode }) => (
    <div style={{ fontFamily: SERIF, fontSize: 15, fontWeight: 700, color: theme.text, margin: '18px 0 6px' }}>{children}</div>
  );
  const Code = ({ children }: { children: string }) => (
    <pre style={{
      fontFamily: FONT_MONO, fontSize: 12, lineHeight: 1.7, color: theme.text,
      background: theme.bgMuted, border: `1px solid ${theme.borderLight}`,
      borderRadius: 6, padding: '10px 14px', margin: '0 0 12px', overflowX: 'auto',
    }}>{children}</pre>
  );
  const C = ({ children }: { children: React.ReactNode }) => (
    <code style={{ fontFamily: FONT_MONO, fontSize: 12, background: theme.bgMuted, borderRadius: 4, padding: '1px 5px' }}>{children}</code>
  );
  // O'Reilly margin note: rule to the left, small-caps label, no icons.
  const Note = ({ kind = 'note', children }: { kind?: 'note' | 'warning'; children: React.ReactNode }) => {
    const c = kind === 'warning' ? COLOR_WARNING : PRIMARY_COLOR;
    return (
      <div style={{ borderLeft: `3px solid ${c}`, padding: '6px 0 6px 14px', margin: '14px 0' }}>
        <div style={{ fontFamily: SERIF, fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: c, marginBottom: 3 }}>
          {kind === 'warning' ? 'Warning' : 'Note'}
        </div>
        <div style={{ fontSize: 12.5, lineHeight: 1.65, color: theme.textMuted, fontStyle: 'italic' }}>{children}</div>
      </div>
    );
  };
  const Table = ({ rows }: { rows: Array<[React.ReactNode, React.ReactNode]> }) => (
    <div style={{ overflowX: 'auto', margin: '0 0 12px' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12.5 }}>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${theme.borderLight}` }}>
              <td style={{ fontFamily: FONT_MONO, fontSize: 11.5, color: theme.text, padding: '7px 14px 7px 0', whiteSpace: 'nowrap', verticalAlign: 'top' }}>{r[0]}</td>
              <td style={{ color: theme.textMuted, padding: '7px 0', lineHeight: 1.55 }}>{r[1]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const chapters: Chapter[] = [
    {
      id: 'setup', title: 'Getting Started',
      body: () => (
        <>
          <H>Getting Started</H>
          <Rule />
          <P>
            BroadcastOKR is a React 19 + TypeScript application with an Express bridge service and an
            Electron desktop shell, all in one npm workspace. You need <b>Node.js 22</b> (the version CI runs)
            and npm. Oracle and PostgreSQL drivers load at runtime — neither is required for development.
          </P>
          <Code>{`git clone https://github.com/PolycarpusTack/BroadcastOKR.git
cd BroadcastOKR/broadcastokr
npm ci`}</Code>
          <Sub>Run it</Sub>
          <Table rows={[
            [<>npm run dev</>, <>Vite dev server on <C>localhost:5173</C> — the app runs fully offline against localStorage.</>],
            [<>npm run bridge</>, <>Bridge service on port 3001 — enables live KRs, shared data, and the connection indicator.</>],
            [<>npm run electron:dev</>, <>Desktop shell: starts Vite, waits for it, launches Electron (which forks the bridge itself).</>],
          ]} />
          <Sub>Configure the bridge (optional in dev)</Sub>
          <P>
            Copy <C>bridge/.env.example</C> to <C>bridge/.env</C>. With no <C>BRIDGE_API_KEY</C> set, auth is
            disabled — fine locally, never in a deployment.
          </P>
          <Table rows={[
            [<>BRIDGE_PORT / BRIDGE_HOST</>, <>Default 3001 on 0.0.0.0 — set host to 127.0.0.1 to keep it local.</>],
            [<>BRIDGE_API_KEY</>, <>Enables bearer auth on all data endpoints and keys the AES-256-GCM credential encryption.</>],
            [<>BRIDGE_DB_PATH</>, <>SQLite file for the shared data layer (default <C>bridge/broadcastokr.db</C>).</>],
            [<>BRIDGE_RATE_LIMIT / _WINDOW_MS</>, <>Per-IP rate limiting; <C>/api/health</C> is exempt.</>],
            [<>ORACLE_CLIENT_DIR</>, <>Oracle Instant Client path, only for thick-mode Oracle.</>],
          ]} />
          <Note>
            The frontend reads <C>VITE_BRIDGE_API_KEY</C> at build time. It is baked into the bundle —
            an accepted trade-off for a desktop app on a trusted machine, documented in
            <C>docs/PRODUCTION-READINESS.md</C>.
          </Note>
        </>
      ),
    },
    {
      id: 'arch', title: 'Architecture',
      body: () => (
        <>
          <H>Architecture</H>
          <Rule />
          <P>
            Three processes, one direction of trust: the <b>app</b> (React, local-first, Zustand persisted to
            localStorage) talks to the <b>bridge</b> (Express, port 3001), which is the only thing that talks to
            databases — client WHATS'ON instances read-only, and its own SQLite for shared state.
          </P>
          <Code>{`src/        React app — pages, components, hooks, store, utils
bridge/     Express service — routes/, middleware/, db/, migrations/
electron/   main.cjs (forks the bridge) + preload.cjs (contextBridge API)`}</Code>
          <Sub>Load-bearing invariants</Sub>
          <Table rows={[
            [<>krProgress()</>, <>src/utils/progress.ts is the <i>single source of truth</i> for KR progress — direction-aware, hold-the-line. The bridge never computes progress; the client PUTs the recalculated goal.</>],
            [<>liveConfig</>, <>A KR is "live" iff <C>kr.liveConfig</C> exists. There is no separate boolean.</>],
            [<>KR identity</>, <>KRs are matched by <C>kr.id</C>, never by array index. Batch results re-attach krIds via <C>src/utils/liveSync.ts</C>.</>],
            [<>structuredClone</>, <>Store actions clone state before mutating; <C>recalcGoal()</C> re-derives goal progress from KRs.</>],
            [<>Timestamps</>, <>The bridge stores sqlite <C>datetime('now')</C> (UTC, no 'T'). Anything comparing frontend ISO strings must normalize — see <C>normalizeSince</C> in bridge/routes/sync.cjs.</>],
          ]} />
          <Sub>Multi-user sync</Sub>
          <P>
            Writes are optimistic: the store mutates locally, then fires a fire-and-forget bridge write
            (failures surface as a toast via <C>bridgeWriteFailed</C>). Reads flow the other way — a full
            <C>/api/sync/state</C> on connect, then <C>/api/sync/changes?since=</C> every 5 seconds, merged
            by id. First connect to an <i>empty</i> bridge migrates local data up (users first, for FK order)
            instead of adopting the empty state.
          </P>
        </>
      ),
    },
    {
      id: 'bridge', title: 'The Bridge',
      body: () => (
        <>
          <H>The Bridge</H>
          <Rule />
          <P>
            Everything security-relevant lives here. SQL execution is <b>SELECT-only</b>, enforced by
            <C>assertSelectOnly</C> (comment stripping, stacked-statement blocking); internal queries are
            parameterized; Oracle <C>:named</C> binds are converted to PostgreSQL <C>$1</C> positional
            automatically. Auth, logging, and rate limiting are middleware mounted <i>before</i> all routes.
          </P>
          <Sub>Route families</Sub>
          <Table rows={[
            [<>/api/health</>, <>Status, drivers, DB stats. Unauthenticated by design.</>],
            [<>/api/test-connection, /api/tables, /api/columns, /api/preview-query, /api/channels</>, <>Schema browsing and query preview against client databases.</>],
            [<>/api/kpi/*</>, <>KPI definitions, polling, execute-batch (live KR sync), per-dialect SQL templates.</>],
            [<>/api/goals, /api/tasks, /api/clients, /api/users, /api/teams, /api/goal-templates</>, <>SQLite-backed CRUD (bridge/routes/*.cjs). Check-in records history and bumps updated_at only.</>],
            [<>/api/sync/*</>, <>state, changes, migrate-from-local, backup download.</>],
          ]} />
          <Note kind="warning">
            The frontend↔bridge path contract is CI-enforced: <C>bridge/__tests__/route-contract.test.cjs</C>{' '}
            scans every <C>/api/*</C> literal under <C>src/</C> and fails on any unmounted route. If you add an
            endpoint or a call, the contract test is the first thing to satisfy.
          </Note>
        </>
      ),
    },
    {
      id: 'testing', title: 'Testing & Quality',
      body: () => (
        <>
          <H>Testing &amp; Quality</H>
          <Rule />
          <Table rows={[
            [<>npm test</>, <>Vitest unit suite (~190 tests). Store logic, utils, and component smokes.</>],
            [<>npm run test:bridge</>, <>node:test suite (~52 tests) — DB operations, middleware, the route contract, check-in propagation, packaging paths.</>],
            [<>npm run test:e2e</>, <>Playwright against a real bridge with an in-memory DB.</>],
            [<>npm run lint</>, <>ESLint, zero-error policy — a CI gate.</>],
            [<>npm run build</>, <><C>tsc -b &amp;&amp; vite build</C> — must pass before committing; plain <C>tsc --noEmit</C> misses noUnusedLocals.</>],
          ]} />
          <P>
            CI runs all of the above on every push and pull request. The risk-bearing code — store actions,
            progress math, bridge routes — carries the substantive tests; page components have render smokes.
            When you fix a defect, land the failing test first.
          </P>
          <Note>
            Underscore-prefixed parameters (<C>_dark</C>) are the convention for intentionally unused
            arguments; providers and their consumer hooks are deliberately colocated in{' '}
            <C>src/context/</C> — both are encoded in <C>eslint.config.js</C>.
          </Note>
        </>
      ),
    },
    {
      id: 'build', title: 'Building & Packaging',
      body: () => (
        <>
          <H>Building &amp; Packaging</H>
          <Rule />
          <Table rows={[
            [<>npm run build</>, <>Production web build to <C>dist/</C> (code-split; main chunk ~67 kB gzip ~20 kB).</>],
            [<>npm run electron:build</>, <>Windows NSIS installer.</>],
            [<>npm run electron:build:linux</>, <>AppImage + deb.</>],
            [<>npm run electron:build:mac</>, <>dmg.</>],
          ]} />
          <P>
            The packaged app ships the bridge inside <C>app.asar</C> and forks it from there —
            module resolution only works from <i>inside</i> the archive. All writable bridge paths
            (database, config, history, logs) are redirected to the user-data directory via environment
            variables set in <C>electron/main.cjs</C>.
          </P>
          <Note kind="warning">
            electron-builder rebuilds <C>better-sqlite3</C> for Electron's ABI. After any{' '}
            <C>electron:build*</C>, run <C>npm rebuild better-sqlite3</C> or the dev bridge and its tests
            fail with an ABI mismatch.
          </Note>
          <Sub>Deploying the bridge standalone</Sub>
          <P>
            For a shared team bridge, deploy it without Electron: <C>docker compose up -d</C> from the repo
            root (or bare <C>npm run bridge</C> under a process manager). Set <C>BRIDGE_API_KEY</C>, mount the
            SQLite file, and schedule backups — the runbook is <C>docs/operations.md</C>.
          </P>
        </>
      ),
    },
    {
      id: 'conventions', title: 'Conventions & Contributing',
      body: () => (
        <>
          <H>Conventions &amp; Contributing</H>
          <Rule />
          <Table rows={[
            [<>Exports</>, <>Named exports only; the sole default export is <C>App.tsx</C>.</>],
            [<>Styling</>, <>Inline styles with the theme object passed down — no CSS modules. Brand color via the <C>PRIMARY_COLOR</C> constant.</>],
            [<>Type</>, <>Space Grotesk (headings), IBM Plex Sans (body), JetBrains Mono (code/data) — constants in <C>src/constants/config.ts</C>.</>],
            [<>Branches</>, <>Feature branches merged to main with <C>--no-ff</C>; commits follow <C>type(scope): summary</C>.</>],
            [<>Docs</>, <><C>CLAUDE.md</C> is the living architecture document — update it when structure or counts change.</>],
          ]} />
          <P>
            Process state lives in <C>docs/gpm/state/</C>: the current execution mode, the active backlog with
            its technical-debt register, and phase summaries. Read <C>mode.md</C> before starting significant
            work; register shortcuts as TD items rather than leaving them silent.
          </P>
          <Note>
            Before writing a helper, search for an existing one — <C>src/utils/</C> is small and deliberate.
            Extract shared code on the third occurrence, not the first.
          </Note>
        </>
      ),
    },
  ];

  const current = chapters.find((c) => c.id === active) ?? chapters[0];
  const currentIndex = chapters.indexOf(current);

  return (
    <Modal open={open} onClose={onClose} title={'\u{1F4D6} The Developer’s Guide'} theme={theme} width={880}>
      {/* O'Reilly-style cover strip */}
      <div style={{
        background: PRIMARY_COLOR, borderRadius: 8, padding: '14px 18px', marginBottom: 16,
        display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap',
      }}>
        <span style={{ fontFamily: SERIF, fontSize: 19, fontWeight: 700, color: '#fff' }}>
          BroadcastOKR
        </span>
        <span style={{ fontFamily: SERIF, fontSize: 13, fontStyle: 'italic', color: '#FFFFFFCC' }}>
          Setup, internals &amp; contribution
        </span>
        <span style={{ marginLeft: 'auto', fontFamily: FONT_MONO, fontSize: 10, letterSpacing: 1, color: '#FFFFFF99' }}>
          COVERS v1.0
        </span>
      </div>

      <div style={{ display: 'flex', gap: 18, minHeight: 400 }}>
        <nav aria-label="Guide chapters" style={{ width: 210, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {chapters.map((c, i) => {
            const on = c.id === active;
            return (
              <button
                key={c.id}
                onClick={() => setActive(c.id)}
                aria-current={on ? 'true' : undefined}
                style={{
                  display: 'flex', alignItems: 'baseline', gap: 9, textAlign: 'left',
                  padding: '9px 11px', borderRadius: 6, cursor: 'pointer',
                  border: 'none',
                  borderLeft: `3px solid ${on ? PRIMARY_COLOR : 'transparent'}`,
                  background: on ? theme.bgMuted : 'transparent',
                  color: on ? theme.text : theme.textMuted,
                  fontSize: 12.5, fontWeight: on ? 700 : 500,
                }}
              >
                <span style={{ fontFamily: SERIF, fontSize: 12, color: on ? PRIMARY_COLOR : theme.textFaint, fontVariantNumeric: 'tabular-nums' }}>{i + 1}.</span>
                {c.title}
              </button>
            );
          })}
        </nav>

        <div style={{ flex: 1, minWidth: 0, paddingRight: 4, overflow: 'auto', maxHeight: 450 }}>
          <div style={{ fontFamily: FONT_MONO, fontSize: 10, letterSpacing: 1.5, color: theme.textFaint, textTransform: 'uppercase', marginBottom: 8 }}>
            Chapter {currentIndex + 1} of {chapters.length}
          </div>
          {current.body()}
        </div>
      </div>
    </Modal>
  );
}
