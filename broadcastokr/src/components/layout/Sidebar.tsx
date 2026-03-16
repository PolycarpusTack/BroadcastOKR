import { useLocation, useNavigate } from 'react-router-dom';
import type { Theme, User } from '../../types';
import { Avatar } from '../ui/Avatar';
import { PRIMARY_COLOR, PRIMARY_GRADIENT, COLOR_COBALT_MID, FONT_HEADING, FONT_BODY, FONT_MONO } from '../../constants/config';

const NAV = [
  { path: '/dashboard', label: 'Dashboard', icon: '\u{1F4CA}' },
  { path: '/goals', label: 'Goals', icon: '\u{1F3AF}' },
  { path: '/compare', label: 'Compare', icon: '\u{1F50D}' },
  { path: '/tasks', label: 'Tasks', icon: '\u2705' },
  { path: '/team', label: 'Team', icon: '\u{1F465}' },
  { path: '/clients', label: 'Settings', icon: '\u2699\uFE0F' },
  { path: '/reports', label: 'Reports', icon: '\u{1F4C8}' },
];

interface SidebarProps {
  open: boolean;
  onToggle: () => void;
  theme: Theme;
  user: User;
  actLogCount: number;
  onOpenLog: () => void;
}

export function Sidebar({ open, onToggle, theme, user, actLogCount, onOpenLog }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <aside
      aria-label="Main navigation"
      style={{
        width: open ? 256 : 64,
        background: theme.bgSidebar,
        borderRight: `1px solid ${theme.border}`,
        display: 'flex',
        flexDirection: 'column',
        transition: 'width .25s ease',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      <button
        onClick={onToggle}
        aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'}
        aria-expanded={open}
        style={{
          padding: open ? '24px 20px 20px' : '24px 12px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          cursor: 'pointer',
          background: 'none',
          border: 'none',
          borderBottom: `1px solid ${theme.border}`,
          textAlign: 'left',
          width: '100%',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 32,
            height: 32,
            borderRadius: 7,
            background: PRIMARY_GRADIENT,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            flexShrink: 0,
          }}
        >
          {'\u{1F4E1}'}
        </div>
        {open && (
          <div>
            <div style={{ fontFamily: FONT_HEADING, fontSize: 17, fontWeight: 700, color: '#F0F4FF', letterSpacing: '-0.4px' }}>BroadcastOKR</div>
            <div style={{ fontFamily: FONT_MONO, fontSize: '9.5px', color: '#3D4F68', letterSpacing: '0.8px', textTransform: 'uppercase' as const }}>Operations Goals</div>
          </div>
        )}
      </button>

      <nav role="navigation" aria-label="Page navigation" style={{ flex: 1, padding: '12px 0' }}>
        <div style={{ padding: '6px 20px 4px', fontSize: '9.5px', textTransform: 'uppercase' as const, letterSpacing: '1.2px', color: '#3D4F68', fontWeight: 600 }}>
          {open ? 'Navigation' : ''}
        </div>
        {NAV.map((n) => {
          const active = location.pathname === n.path;
          return (
            <button
              key={n.path}
              onClick={() => navigate(n.path)}
              aria-label={!open ? n.label : undefined}
              aria-current={active ? 'page' : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: open ? 'calc(100% - 20px)' : 'calc(100% - 16px)',
                padding: '7px 18px',
                margin: open ? '1px 10px' : '1px 8px',
                borderRadius: 6,
                border: 'none',
                cursor: 'pointer',
                background: active ? '#2A3855' : 'transparent',
                color: active ? COLOR_COBALT_MID : '#5E6F8A',
                fontSize: '12.5px',
                fontWeight: 500,
                fontFamily: FONT_BODY,
                textAlign: 'left',
                transition: 'all .12s',
                position: 'relative' as const,
              }}
            >
              {active && (
                <div style={{
                  position: 'absolute',
                  left: open ? -10 : -8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 3,
                  height: 16,
                  background: PRIMARY_COLOR,
                  borderRadius: '0 2px 2px 0',
                }} />
              )}
              <span aria-hidden="true" style={{ fontSize: 14, flexShrink: 0 }}>{n.icon}</span>
              {open && n.label}
            </button>
          );
        })}
      </nav>

      {open && (
        <div style={{ padding: '12px 16px 20px', borderTop: `1px solid ${theme.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Avatar user={user} size={32} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#F0F4FF' }}>{user.name}</div>
              <div style={{ fontFamily: FONT_MONO, fontSize: '10px', color: '#5E6F8A', textTransform: 'uppercase' as const, letterSpacing: '0.6px' }}>{user.role}</div>
            </div>
          </div>
          <button
            onClick={onOpenLog}
            aria-label={`Open activity log, ${actLogCount} entries`}
            style={{
              marginTop: 10,
              width: '100%',
              padding: '6px 10px',
              borderRadius: 6,
              border: `1px solid #2E3F5C`,
              background: 'transparent',
              color: '#9BAAC4',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            {'\u{1F4CB}'} Activity Log ({actLogCount})
          </button>
        </div>
      )}
    </aside>
  );
}
