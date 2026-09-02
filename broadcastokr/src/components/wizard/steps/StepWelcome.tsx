import type { StepProps } from '../wizardTypes';
import { FONT_BODY } from '../../../constants/config';

export function StepWelcome({ theme, context }: StepProps) {
  const p = { fontSize: 13, fontFamily: FONT_BODY, color: theme.textSecondary, lineHeight: 1.6, margin: '0 0 12px 0' };

  return (
    <div>
      <p style={p}>
        This walks you through the plumbing once, and ends with a real number on screen — pulled
        from your own database, not a sample.
      </p>
      <p style={p}>Here is the shape of it:</p>
      <ul style={{ ...p, paddingLeft: 20 }}>
        <li><b>The bridge</b> — the helper that talks to your database. Usually already running.</li>
        <li><b>A database connection</b> — where WHATS'ON lives, tested before it is saved.</li>
        {context.fleet && <li><b>A client</b> — who the goals belong to, and which channels they own.</li>}
        <li><b>Something to measure</b> — a goal with a live Key Result, a dashboard KPI, or both.</li>
      </ul>
      <p style={{ ...p, marginTop: 16, color: theme.textFaint, fontSize: 12 }}>
        Nothing here is permanent-only-once: every step can be redone later from the normal screens,
        and you can stop at any point without losing what you have already set up.
      </p>
    </div>
  );
}
