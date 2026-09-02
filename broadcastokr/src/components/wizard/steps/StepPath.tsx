import type { StepProps } from '../wizardTypes';
import type { WizardPath } from '../wizardTypes';
import { FONT_BODY, FONT_HEADING, PRIMARY_COLOR } from '../../../constants/config';

const OPTIONS: Array<{ id: WizardPath; title: string; blurb: string; icon: string }> = [
  {
    id: 'kr',
    icon: '\u{1F3AF}',
    title: 'A goal with a live Key Result',
    blurb: 'A number attached to a commitment: it has a target, an owner, a history, and people '
      + 'check in on it with a confidence and a note. Use it when someone is accountable for moving it.',
  },
  {
    id: 'kpi',
    icon: '\u{1F4C8}',
    title: 'A dashboard KPI',
    blurb: 'A number you want to watch. It appears on the Dashboard with a target and a trend, '
      + 'but nobody owns it and nobody checks in on it. Use it for situational awareness.',
  },
  {
    id: 'both',
    icon: '\u{1F500}',
    title: 'Both',
    blurb: 'Set up one of each. Two extra minutes, and you will see exactly how the two differ.',
  },
];

export function StepPath({ data, patch, theme }: StepProps) {
  const p = { fontSize: 13, fontFamily: FONT_BODY, color: theme.textSecondary, lineHeight: 1.6, margin: '0 0 14px 0' };

  return (
    <div>
      <p style={p}>
        BrOKR measures things two ways, and they look similar at first. The difference is
        accountability, not the query — both run the same kind of SQL against the same connection.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {OPTIONS.map((option) => {
          const selected = data.path === option.id;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={selected}
              onClick={() => patch({ path: option.id })}
              style={{
                textAlign: 'left', padding: '12px 14px', borderRadius: 8, cursor: 'pointer',
                background: selected ? `${PRIMARY_COLOR}12` : 'transparent',
                border: `1px solid ${selected ? PRIMARY_COLOR : theme.borderLight}`,
              }}
            >
              <div style={{
                fontFamily: FONT_HEADING, fontSize: 13, fontWeight: 700,
                color: selected ? PRIMARY_COLOR : theme.text, marginBottom: 3,
              }}>
                {option.icon} {option.title}
              </div>
              <div style={{ fontSize: 12, fontFamily: FONT_BODY, color: theme.textSecondary, lineHeight: 1.5 }}>
                {option.blurb}
              </div>
            </button>
          );
        })}
      </div>

      <p style={{ ...p, marginTop: 14, marginBottom: 0, fontSize: 12, color: theme.textFaint }}>
        A rule of thumb that holds up: if nobody would be asked to explain the number at a review,
        it is a KPI, not a Key Result.
      </p>
    </div>
  );
}
