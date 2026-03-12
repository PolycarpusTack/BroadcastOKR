import { useLocation, useNavigate } from 'react-router-dom';
import type { Theme, RolePermissions } from '../../types';

const PAGE_INFO: Record<string, { icon: string; label: string; desc: string }> = {
  '/dashboard': { icon: '\u{1F4CA}', label: 'Dashboard', desc: 'Channel health, KPIs, and operational overview' },
  '/goals': { icon: '\u{1F3AF}', label: 'Goals', desc: 'OKR objectives and key results by channel' },
  '/tasks': { icon: '\u2705', label: 'Tasks', desc: 'Broadcast operations workflow and task management' },
  '/team': { icon: '\u{1F465}', label: 'Team', desc: 'Operations crew and team workload' },
  '/reports': { icon: '\u{1F4C8}', label: 'Reports', desc: 'Analytics, compliance, and operational reporting' },
};

interface HeaderProps {
  theme: Theme;
  taskCount: number;
  perms: RolePermissions;
  onCreateTask: () => void;
}

export function Header({ theme, taskCount, perms, onCreateTask }: HeaderProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const page = PAGE_INFO[location.pathname] || PAGE_INFO['/dashboard'];

  return (
    <header
      style={{
        padding: '16px 28px',
        background: theme.headerBg,
        borderBottom: `1px solid ${theme.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        transition: 'background .3s',
      }}
    >
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: theme.text, margin: 0, letterSpacing: '-.02em' }}>
          {page.icon} {page.label}
        </h1>
        <p style={{ fontSize: 12, color: theme.textFaint, margin: 0, marginTop: 2 }}>{page.desc}</p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ padding: '4px 10px', borderRadius: 6, background: theme.bgMuted, border: `1px solid ${theme.border}`, fontSize: 11, color: theme.textMuted }}>
          Q1 2026
        </span>
        <span style={{ padding: '4px 10px', borderRadius: 6, background: theme.bgMuted, border: `1px solid ${theme.border}`, fontSize: 11, color: theme.textMuted }}>
          {taskCount} tasks
        </span>
        {perms.canCreate && (
          <button
            onClick={() => {
              navigate('/tasks');
              onCreateTask();
            }}
            style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: '#4f46e5', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
          >
            + Task
          </button>
        )}
      </div>
    </header>
  );
}
