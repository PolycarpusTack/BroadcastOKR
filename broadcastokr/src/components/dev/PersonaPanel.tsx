import { useState } from 'react';
import type { Theme, User } from '../../types';
import { USERS, ROLE_PERMS } from '../../constants';
import { Avatar } from '../ui/Avatar';
import { roleColor } from '../../utils/colors';
import { PRIMARY_COLOR, COLOR_SUCCESS, COLOR_DANGER, PRIMARY_GRADIENT, FONT_HEADING, FONT_MONO } from '../../constants/config';

interface PersonaPanelProps {
  currentUser: User;
  setCurrentUser: (u: User) => void;
  theme: Theme;
  onStress: () => void;
}

export function PersonaPanel({ currentUser, setCurrentUser, theme, onStress }: PersonaPanelProps) {
  const [open, setOpen] = useState(false);
  const perms = ROLE_PERMS[currentUser.role];

  return (
    <div style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 900 }}>
      {open && (
        <div
          style={{
            background: theme.bgCard,
            border: `1px solid ${theme.border}`,
            borderRadius: 10,
            padding: 18,
            marginBottom: 10,
            width: 320,
            boxShadow: '0 12px 40px rgba(0,0,0,.2)',
            maxHeight: '80vh',
            overflow: 'auto',
          }}
        >
          <div style={{ fontFamily: FONT_HEADING, fontSize: 13, fontWeight: 700, color: theme.text, marginBottom: 12 }}>Prototype Control Panel</div>

          <div style={{ fontSize: 11, fontWeight: 600, color: theme.textMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>Switch Persona</div>
          {USERS.map((u) => {
            const active = currentUser.id === u.id;
            return (
              <button
                key={u.id}
                onClick={() => setCurrentUser(u)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: active ? `2px solid ${PRIMARY_COLOR}` : `1px solid ${theme.borderLight}`,
                  cursor: 'pointer',
                  background: active ? `${PRIMARY_COLOR}20` : 'transparent',
                  marginBottom: 4,
                  textAlign: 'left',
                }}
              >
                <Avatar user={u} size={28} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>{u.name}</div>
                  <div style={{ fontSize: 10, color: theme.textFaint }}>
                    {u.title} &mdash;{' '}
                    <span style={{ color: roleColor(u.role), fontWeight: 700 }}>{u.role}</span>
                  </div>
                </div>
              </button>
            );
          })}

          <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: theme.bgMuted, border: `1px solid ${theme.borderLight}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, marginBottom: 6 }}>Active Permissions</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {Object.entries(perms)
                .filter(([k, v]) => k.startsWith('can') && typeof v === 'boolean')
                .map(([k, v]) => (
                  <span key={k} style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, fontFamily: FONT_MONO, background: v ? `${COLOR_SUCCESS}20` : `${COLOR_DANGER}20`, color: v ? COLOR_SUCCESS : COLOR_DANGER }}>
                    {v ? '\u2713' : '\u2717'} {k.replace('can', '')}
                  </span>
                ))}
            </div>
          </div>

          <button
            onClick={() => { onStress(); setOpen(false); }}
            style={{ marginTop: 10, width: '100%', padding: '10px 14px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#f59e0b,#ef4444)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
          >
            {'\u{1F525}'} Stress Test (+60 tasks)
          </button>
        </div>
      )}

      <button
        onClick={() => setOpen(!open)}
        aria-label={open ? 'Close control panel' : 'Open control panel'}
        style={{
          width: 52,
          height: 52,
          borderRadius: '50%',
          border: 'none',
          background: PRIMARY_GRADIENT,
          color: '#fff',
          fontSize: 22,
          cursor: 'pointer',
          boxShadow: '0 6px 20px rgba(56,5,227,.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'transform .2s',
        }}
        onMouseEnter={(e) => { (e.currentTarget.style.transform = 'scale(1.08)'); }}
        onMouseLeave={(e) => { (e.currentTarget.style.transform = 'scale(1)'); }}
      >
        {open ? '\u2715' : '\u2699\uFE0F'}
      </button>
    </div>
  );
}
