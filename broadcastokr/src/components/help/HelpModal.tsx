import { useState } from 'react';
import { Modal } from '../ui/Modal';
import type { Theme } from '../../types';
import {
  PRIMARY_COLOR, COLOR_SUCCESS, COLOR_WARNING, COLOR_DANGER,
  FONT_HEADING, FONT_MONO,
} from '../../constants/config';

interface HelpModalProps {
  open: boolean;
  onClose: () => void;
  theme: Theme;
}

interface Section {
  id: string;
  icon: string;
  title: string;
  body: () => React.ReactNode;
}

export function HelpModal({ open, onClose, theme }: HelpModalProps) {
  const [active, setActive] = useState('start');

  // ---- small inline helpers (theme-aware, For-Dummies styling) ----
  const H = ({ children }: { children: React.ReactNode }) => (
    <div style={{ fontFamily: FONT_HEADING, fontSize: 17, fontWeight: 700, color: theme.text, marginBottom: 10 }}>{children}</div>
  );
  const P = ({ children }: { children: React.ReactNode }) => (
    <p style={{ fontSize: 13.5, lineHeight: 1.7, color: theme.textMuted, margin: '0 0 12px' }}>{children}</p>
  );
  const Sub = ({ children }: { children: React.ReactNode }) => (
    <div style={{ fontSize: 13, fontWeight: 700, color: theme.text, margin: '14px 0 6px' }}>{children}</div>
  );
  // Plain-English jargon buster
  const Jargon = ({ term, children }: { term: string; children: React.ReactNode }) => (
    <div style={{ display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 8, background: theme.bgMuted, border: `1px solid ${theme.borderLight}`, margin: '0 0 8px' }}>
      <span style={{ fontFamily: FONT_MONO, fontSize: 11, fontWeight: 700, color: PRIMARY_COLOR, whiteSpace: 'nowrap' }}>{term}</span>
      <span style={{ fontSize: 12.5, lineHeight: 1.6, color: theme.textMuted }}>{children}</span>
    </div>
  );
  // Callout box, "Head First" style — tip / watch-out / try-this
  const Callout = ({ kind, children }: { kind: 'tip' | 'watch' | 'try'; children: React.ReactNode }) => {
    const cfg = {
      tip: { c: COLOR_SUCCESS, icon: '\u{1F4A1}', label: 'TIP' },
      watch: { c: COLOR_WARNING, icon: '⚠️', label: 'WATCH OUT' },
      try: { c: PRIMARY_COLOR, icon: '\u{1F3AF}', label: 'TRY THIS' },
    }[kind];
    return (
      <div style={{ display: 'flex', gap: 10, padding: '11px 13px', borderRadius: 8, background: `${cfg.c}12`, border: `1px solid ${cfg.c}44`, margin: '12px 0' }}>
        <span aria-hidden="true" style={{ fontSize: 15 }}>{cfg.icon}</span>
        <div>
          <div style={{ fontSize: 10, fontFamily: FONT_MONO, fontWeight: 700, letterSpacing: 1, color: cfg.c, marginBottom: 3 }}>{cfg.label}</div>
          <div style={{ fontSize: 12.5, lineHeight: 1.6, color: theme.text }}>{children}</div>
        </div>
      </div>
    );
  };
  const Steps = ({ items }: { items: React.ReactNode[] }) => (
    <ol style={{ margin: '0 0 12px', paddingLeft: 0, listStyle: 'none', counterReset: 'step' }}>
      {items.map((it, i) => (
        <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 8 }}>
          <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: '50%', background: PRIMARY_COLOR, color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
          <span style={{ fontSize: 13, lineHeight: 1.6, color: theme.textMuted, paddingTop: 1 }}>{it}</span>
        </li>
      ))}
    </ol>
  );

  const sections: Section[] = [
    {
      id: 'start', icon: '\u{1F44B}', title: 'Start Here',
      body: () => (
        <>
          <H>Welcome! Here's the 30-second version.</H>
          <P>
            BroadcastOKR helps a broadcast operations team set <b>goals</b> and watch them update themselves
            from your live WHATS'ON data. No more copying numbers into a spreadsheet every Monday.
          </P>
          <P>Three words you'll see everywhere — let's demystify them right now:</P>
          <Jargon term="Objective">The thing you want to achieve. Plain English. e.g. "Use our drama rights efficiently."</Jargon>
          <Jargon term="Key Result (KR)">How you'll know you got there — a number with a target. e.g. "Drama run utilisation ≥ 85%."</Jargon>
          <Jargon term="OKR">Just an Objective + its Key Results, bundled together. That's the whole idea.</Jargon>
          <Callout kind="try">
            New here? Open <b>Goals</b> in the left sidebar and click any goal to expand it. You'll see its
            Key Results with progress bars. That's the heart of the app.
          </Callout>
          <Callout kind="tip">
            Everything is colour-coded the same way across the app:
            <span style={{ color: COLOR_SUCCESS, fontWeight: 700 }}> green = on track</span>,
            <span style={{ color: COLOR_WARNING, fontWeight: 700 }}> amber = at risk</span>,
            <span style={{ color: COLOR_DANGER, fontWeight: 700 }}> red = behind</span>. Once you learn it here, you know it everywhere.
          </Callout>
        </>
      ),
    },
    {
      id: 'tour', icon: '\u{1F9ED}', title: 'The Grand Tour',
      body: () => (
        <>
          <H>What's behind each sidebar button?</H>
          <P>Seven pages. Here's what each one is <i>for</i>, in one breath each:</P>
          <Jargon term={'\u{1F4CA} Dashboard'}>Your morning coffee view — channel health, KPIs, urgent tasks, system status, all on one screen.</Jargon>
          <Jargon term={'\u{1F3AF} Goals'}>Where the OKRs live. Create goals, check in on Key Results, set up live data sync. You'll spend most time here.</Jargon>
          <Jargon term={'\u{1F50D} Compare'}>Line up several clients side-by-side to see who's healthy and who needs attention.</Jargon>
          <Jargon term={'✅ Tasks'}>A Kanban board (Backlog → To Do → In Progress → Review → Done). Drag work across as it moves.</Jargon>
          <Jargon term={'\u{1F465} Team'}>Who's on the crew, what they own, and how loaded they are.</Jargon>
          <Jargon term={'⚙️ Settings'}>Manage clients, database connections, and channels. The plumbing lives here.</Jargon>
          <Jargon term={'\u{1F4C8} Reports'}>Three report views — by client, by goal, by KR template — with trends and drill-down.</Jargon>
          <Callout kind="tip">
            The little dot in the top bar is your <b>connection indicator</b>.
            Green means the bridge (your live-data link) is connected. Amber pulses while reconnecting. Red means offline —
            you can still work, the app just won't pull fresh numbers until it's back.
          </Callout>
        </>
      ),
    },
    {
      id: 'goal', icon: '\u{1F3AF}', title: 'Make Your First Goal',
      body: () => (
        <>
          <H>Let's build one together.</H>
          <Steps items={[
            <>Go to <b>Goals</b> and click <b>+ New Goal</b>.</>,
            <>Give it a clear title and pick the <b>channel</b> it belongs to.</>,
            <>Add one or more <b>Key Results</b> — each is a measurable target (start value, target value).</>,
            <>Save. Your goal now shows a progress bar that rolls up from its Key Results.</>,
          ]} />
          <Sub>Manual vs. Live Key Results</Sub>
          <P>Each Key Result can work one of two ways:</P>
          <Jargon term="Manual">You type the current value when you check in. Good for things WHATS'ON doesn't track.</Jargon>
          <Jargon term="Live">The app runs a SQL query against your WHATS'ON database and fills the number in for you, on a schedule. Set it once, forget it.</Jargon>
          <Callout kind="watch">
            A Key Result becomes "Live" the moment you give it a database connection + SQL. There's no separate
            on/off switch — presence of the query <i>is</i> the switch. Remove the query and it's manual again.
          </Callout>
          <Callout kind="try">
            Don't have database access yet? Make a <b>Manual</b> KR first. You can always wire it to live data later
            without losing your history.
          </Callout>
        </>
      ),
    },
    {
      id: 'checkin', icon: '✍️', title: 'Check-Ins & History',
      body: () => (
        <>
          <H>A "check-in" is just you saying how it's going.</H>
          <P>
            Every time you update a Key Result, the app records a <b>history entry</b> — the value, who you are,
            when, and optionally a confidence rating and a note. Over time this builds a story you can look back on.
          </P>
          <Steps items={[
            <>Expand a goal and click <b>Check in</b> on one of its Key Results.</>,
            <>Enter the current value.</>,
            <>Pick a confidence (on track / at risk / behind) and jot a note if you like.</>,
            <>Save — the progress bar moves and a dot appears on the KR's sparkline.</>,
          ]} />
          <Jargon term="Confidence">Your gut feel, separate from the raw number. A KR can be at 80% but you flag it "at risk" because you know trouble's coming.</Jargon>
          <Jargon term="Monitoring mode">Turn it on for a goal or client and <i>every</i> automatic sync also writes a history entry — handy when you want a fine-grained record for a while.</Jargon>
          <Callout kind="tip">
            Live KRs record history automatically when they sync. Manual KRs record history when you check in.
            Either way, your trend lines in <b>Reports</b> fill themselves.
          </Callout>
        </>
      ),
    },
    {
      id: 'live', icon: '\u{1F517}', title: 'Live Data & the Bridge',
      body: () => (
        <>
          <H>How the live numbers actually get here.</H>
          <P>
            BroadcastOKR never touches your WHATS'ON database directly. A small helper called the <b>bridge</b>
            sits in the middle. It connects to Oracle or PostgreSQL, runs <i>read-only</i> queries, and hands the
            results back. Nothing is ever written to WHATS'ON.
          </P>
          <Jargon term="Bridge">A little local service (on localhost:3001) that safely reads your database. Green dot in the header = it's running.</Jargon>
          <Jargon term="Connection">The login details for one WHATS'ON database. Set these up in Settings.</Jargon>
          <Jargon term="SELECT-only">The bridge refuses anything that isn't a read. No INSERT, UPDATE, or DELETE can get through. By design.</Jargon>
          <Steps items={[
            <>In <b>Settings</b>, add a database <b>connection</b> (host, service, user, password).</>,
            <>Test it — you want a green tick before moving on.</>,
            <>On a Key Result, choose that connection and write the SQL that returns your number.</>,
            <>The app syncs it on a schedule (every 15 minutes by default).</>,
          ]} />
          <Callout kind="watch">
            If the header dot is red, the bridge isn't reachable. Your goals and history are safe (they're stored
            locally) — you just won't get fresh live numbers until it reconnects.
          </Callout>
        </>
      ),
    },
    {
      id: 'clients', icon: '\u{1F465}', title: 'Clients, Channels & Templates',
      body: () => (
        <>
          <H>Running OKRs for more than one operation?</H>
          <P>
            If you manage several broadcasters (or several channels), you don't want to rebuild the same goals
            over and over. That's what clients and templates are for.
          </P>
          <Jargon term="Client">One organisation or operation you track — with its own database connection and channels.</Jargon>
          <Jargon term="Channel">A TV/radio channel. Goals and tasks are scoped to channels so the right people see the right things.</Jargon>
          <Jargon term="Goal Template">A reusable goal blueprint. Build it once, then "materialise" it for each client — one goal per client, automatically.</Jargon>
          <Callout kind="try">
            Create a template for "Quarterly Rights Compliance," then materialise it across all your clients.
            Each client gets its own copy, and you can give each one different SQL where the databases differ.
          </Callout>
          <Callout kind="tip">
            Change a template later and use <b>sync to goals</b> to push the update out to every materialised copy —
            titles, targets, SQL, and more travel together.
          </Callout>
        </>
      ),
    },
    {
      id: 'roles', icon: '\u{1F510}', title: 'Who Can Do What (Roles)',
      body: () => (
        <>
          <H>Three roles, increasing power.</H>
          <P>Your role decides which buttons you see. From most to least:</P>
          <Jargon term="Owner">The full set — create, edit, <b>delete</b>, assign, check in, change status, and view reports.</Jargon>
          <Jargon term="Manager">Everything an Owner can do <i>except delete</i>. Build and run, but can't remove.</Jargon>
          <Jargon term="Member">Hands-on day-to-day: check in on Key Results and move tasks. No creating, editing, or reports.</Jargon>
          <Callout kind="tip">
            If a button you expect is missing, it's almost always your role. A Member won't see "+ New Goal," for
            instance — that's working as intended, not a bug.
          </Callout>
        </>
      ),
    },
    {
      id: 'data', icon: '\u{1F4C1}', title: 'Saving, Import & Export',
      body: () => (
        <>
          <H>Where does my work go?</H>
          <P>
            Your goals, tasks, and check-in history are saved <b>automatically</b> as you go. No save button to hunt for.
          </P>
          <Jargon term="Import / Export">The folder button in the top bar. Pull data in from Excel/CSV/JSON, or push your data out to share or back up.</Jargon>
          <Callout kind="try">
            Use <b>Export → Excel</b> before a big review to take a snapshot you can email around.
            Use <b>Import</b> to bulk-load goals or tasks instead of typing them one by one.
          </Callout>
          <Callout kind="watch">
            If you ever see a "storage is full" message, export your data to free up space — it's a sign your
            local store is getting large, usually from lots of history.
          </Callout>
        </>
      ),
    },
    {
      id: 'stuck', icon: '\u{1F198}', title: "When You're Stuck",
      body: () => (
        <>
          <H>Quick answers to "why isn't this working?"</H>
          <Sub>My live numbers aren't updating</Sub>
          <P>Check the header dot. Red = bridge offline (start it / check the connection). Green but still stale? Open the goal and hit sync, or check the KR's SQL in Settings.</P>
          <Sub>A button I need is greyed out or missing</Sub>
          <P>It's your role. Members and Managers have fewer powers than Owners — see the "Who Can Do What" section.</P>
          <Sub>The numbers look wrong</Sub>
          <P>Open the Key Result's SQL and run it against your database directly. The app shows exactly what WHATS'ON returns — if the query's off, the number's off.</P>
          <Sub>I lost track of what changed</Sub>
          <P>Open the <b>Activity Log</b> (bottom of the sidebar). It records what happened and who did it.</P>
          <Callout kind="tip">
            You can reopen this guide any time from the <b>?</b> button in the top bar. No need to remember any of it.
          </Callout>
        </>
      ),
    },
  ];

  const current = sections.find((s) => s.id === active) ?? sections[0];

  return (
    <Modal open={open} onClose={onClose} title={'\u{1F4D8} Help & Getting Started'} theme={theme} width={860}>
      <div style={{ display: 'flex', gap: 18, minHeight: 420 }}>
        {/* Left: chapter nav */}
        <nav aria-label="Help topics" style={{ width: 200, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {sections.map((s) => {
            const on = s.id === active;
            return (
              <button
                key={s.id}
                onClick={() => setActive(s.id)}
                aria-current={on ? 'true' : undefined}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9, textAlign: 'left',
                  padding: '9px 11px', borderRadius: 8, cursor: 'pointer',
                  border: `1px solid ${on ? PRIMARY_COLOR + '55' : 'transparent'}`,
                  background: on ? PRIMARY_COLOR + '14' : 'transparent',
                  color: on ? theme.text : theme.textMuted,
                  fontSize: 12.5, fontWeight: on ? 700 : 500,
                }}
              >
                <span aria-hidden="true" style={{ fontSize: 15 }}>{s.icon}</span>
                {s.title}
              </button>
            );
          })}
        </nav>

        {/* Right: chapter content */}
        <div style={{ flex: 1, minWidth: 0, paddingRight: 4, overflow: 'auto', maxHeight: 460 }}>
          {current.body()}
        </div>
      </div>
    </Modal>
  );
}
