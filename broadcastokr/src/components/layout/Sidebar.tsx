import { useLocation, useNavigate } from 'react-router-dom';
import type { Theme, User } from '../../types';
import { Avatar } from '../ui/Avatar';

const NAV = [
  { path: '/dashboard', label: 'Dashboard', icon: '\u{1F4CA}' },
  { path: '/goals', label: 'Goals', icon: '\u{1F3AF}' },
  { path: '/tasks', label: 'Tasks', icon: '\u2705' },
  { path: '/team', label: 'Team', icon: '\u{1F465}' },
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
        width: open ? 240 : 64,
        background: theme.bgSidebar,
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
          padding: open ? '20px 20px 16px' : '20px 12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          cursor: 'pointer',
          background: 'none',
          border: 'none',
          textAlign: 'left',
          width: '100%',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: 'linear-gradient(135deg,#4f46e5,#7c3aed)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
            flexShrink: 0,
          }}
        >
          {'\u{1F4E1}'}
        </div>
        {open && (
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', letterSpacing: '-.02em' }}>BroadcastOKR</div>
            <div style={{ fontSize: 10, color: theme.sidebarText, fontWeight: 500 }}>Operations Goals</div>
          </div>
        )}
      </button>

      <nav role="navigation" aria-label="Page navigation" style={{ flex: 1, padding: '8px' }}>
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
                gap: 12,
                width: '100%',
                padding: open ? '10px 12px' : '10px 14px',
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
                background: active ? theme.bgSidebarActive : 'transparent',
                color: active ? theme.sidebarTextActive : theme.sidebarText,
                fontSize: 13,
                fontWeight: active ? 600 : 400,
                marginBottom: 2,
                textAlign: 'left',
                transition: 'all .15s',
              }}
            >
              <span aria-hidden="true" style={{ fontSize: 16, flexShrink: 0 }}>{n.icon}</span>
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
              <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{user.name}</div>
              <div style={{ fontSize: 10, color: theme.sidebarText }}>{user.role}</div>
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
              border: `1px solid ${theme.border}`,
              background: 'transparent',
              color: theme.sidebarText,
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
