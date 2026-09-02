import type { StepProps } from '../wizardTypes';
import { FONT_BODY, FONT_HEADING, COLOR_SUCCESS, PRIMARY_COLOR } from '../../../constants/config';

const PAGES: Array<[string, string, string]> = [
  ['\u{1F4CA}', 'Dashboard', 'Channel health, live KPIs, urgent tasks — the morning-coffee view.'],
  ['\u{1F3AF}', 'Goals', 'The OKRs. Create goals, check in on Key Results, run a live sync.'],
  ['✅', 'Tasks', 'Kanban board: Backlog → To Do → In Progress → Review → Done.'],
  ['\u{1F465}', 'Team', 'Who is on the crew and what they own.'],
  ['\u{1F4C8}', 'Reports', 'Three views — by client, by goal, by KR template — with trends.'],
  ['⚙️', 'Clients', 'Clients, database connections and channels. The plumbing.'],
];

export function StepFinish({ data, theme, context }: StepProps) {
  const p = { fontSize: 13, fontFamily: FONT_BODY, color: theme.textSecondary, lineHeight: 1.6, margin: '0 0 12px 0' };

  const built = [
    data.connectionId && `the “${data.connectionName}” database connection`,
    data.clientId && 'a client with its channels',
    data.goalId && `the goal “${data.goalTitle}”${data.krValue !== undefined ? ' — already showing a real number' : ''}`,
    data.kpiId && 'a dashboard KPI',
  ].filter(Boolean) as string[];

  return (
    <div>
      {built.length > 0 ? (
        <div style={{
          padding: '12px 14px', borderRadius: 8, marginBottom: 16,
          background: `${COLOR_SUCCESS}12`, border: `1px solid ${COLOR_SUCCESS}44`,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, fontFamily: FONT_BODY, color: theme.text, marginBottom: 6 }}>
            You set up:
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: theme.textSecondary, lineHeight: 1.7 }}>
            {built.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      ) : (
        <p style={p}>
          Nothing was created — that is a fine outcome too. You can start any of these from the
          normal screens whenever you are ready.
        </p>
      )}

      <div style={{ fontFamily: FONT_HEADING, fontSize: 13, fontWeight: 700, color: theme.text, margin: '0 0 8px 0' }}>
        Where things live
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 16 }}>
        {PAGES.filter(([, label]) => context.fleet || label !== 'Clients').map(([icon, label, blurb]) => (
          <div key={label} style={{ display: 'flex', gap: 8, fontSize: 12, fontFamily: FONT_BODY, lineHeight: 1.5 }}>
            <span style={{ width: 18 }} aria-hidden>{icon}</span>
            <span style={{ fontWeight: 700, color: theme.text, minWidth: 74 }}>{label}</span>
            <span style={{ color: theme.textSecondary }}>{blurb}</span>
          </div>
        ))}
      </div>

      <p style={{ ...p, fontSize: 12, color: theme.textFaint, marginBottom: 0 }}>
        This wizard is always available again from <b>Help → Run the setup wizard</b>, and the full
        written guide lives in the same place. Live numbers refresh on their own every 15 minutes;
        the <span style={{ color: PRIMARY_COLOR, fontWeight: 700 }}>Sync now</span> button on the
        Goals page is there for when you cannot wait.
      </p>
    </div>
  );
}
