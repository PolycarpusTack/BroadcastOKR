import type { Theme, ActivityEntry } from '../../types';

interface ActivityLogProps {
  log: ActivityEntry[];
  open: boolean;
  onClose: () => void;
  theme: Theme;
}

export function ActivityLog({ log, open, onClose, theme }: ActivityLogProps) {
  if (!open) return null;

  return (
    <div
      className="animate-slide-in-right"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 360,
        background: theme.bgCard,
        borderLeft: `1px solid ${theme.border}`,
        zIndex: 950,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-8px 0 30px rgba(0,0,0,.1)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${theme.borderLight}` }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: theme.text, margin: 0 }}>{'\u{1F4CB}'} Activity Log</h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: theme.textFaint }}>{'\u2715'}</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px' }}>
        {log.length === 0 ? (
          <div style={{ color: theme.textFaint, fontSize: 13, textAlign: 'center', padding: 40 }}>No activity yet</div>
        ) : (
          log.map((entry) => (
            <div key={entry.id} style={{ padding: '10px 0', borderBottom: `1px solid ${theme.borderLight}`, display: 'flex', gap: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: entry.color || '#4f46e5', marginTop: 5, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>{entry.text}</div>
                <div style={{ fontSize: 11, color: theme.textFaint, marginTop: 2, display: 'flex', gap: 8 }}>
                  <span>{entry.user}</span>
                  <span>{entry.time}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
