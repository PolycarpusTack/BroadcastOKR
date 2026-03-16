import { useLocation, useNavigate } from 'react-router-dom';
import type { Theme, RolePermissions } from '../../types';
import { PRIMARY_COLOR, FONT_HEADING, FONT_MONO } from '../../constants/config';

function currentQuarter(): string {
  const now = new Date();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  return `Q${q} ${now.getFullYear()}`;
}

const PAGE_INFO: Record<string, { icon: string; label: string; desc: string }> = {
  '/dashboard': { icon: '\u{1F4CA}', label: 'Dashboard', desc: 'Channel health, KPIs, and operational overview' },
  '/goals': { icon: '\u{1F3AF}', label: 'Goals', desc: 'OKR objectives and key results by channel' },
  '/tasks': { icon: '\u2705', label: 'Tasks', desc: 'Broadcast operations workflow and task management' },
  '/team': { icon: '\u{1F465}', label: 'Team', desc: 'Operations crew and team workload' },
  '/reports': { icon: '\u{1F4C8}', label: 'Reports', desc: 'Analytics, compliance, and operational reporting' },
  '/compare': { icon: '\u{1F9EE}', label: 'Compare', desc: 'Cross-client health check comparison' },
  '/clients': { icon: '\u2699\uFE0F', label: 'Settings', desc: 'Manage clients, database connections, and channels' },
};

interface HeaderProps {
  theme: Theme;
  taskCount: number;
  perms: RolePermissions;
  onCreateTask: () => void;
  onMobileMenu?: () => void;
  onImportExport?: () => void;
}

export function Header({ theme, taskCount, perms, onCreateTask, onMobileMenu, onImportExport }: HeaderProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const page = PAGE_INFO[location.pathname] || PAGE_INFO['/dashboard'];

  return (
    <header
      role="banner"
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {onMobileMenu && (
          <button
            className="mobile-menu-btn"
            onClick={onMobileMenu}
            aria-label="Open navigation menu"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: theme.text, padding: 4, display: 'none' }}
          >
            {'\u2630'}
          </button>
        )}
        <div>
          <h1 style={{ fontFamily: FONT_HEADING, fontSize: 22, fontWeight: 700, color: theme.text, margin: 0, letterSpacing: '-0.5px' }}>
            <span aria-hidden="true">{page.icon} </span>{page.label}
          </h1>
          <p style={{ fontSize: 12, color: theme.textFaint, margin: 0, marginTop: 2 }}>{page.desc}</p>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ padding: '4px 10px', borderRadius: 6, background: theme.bgMuted, border: `1px solid ${theme.border}`, fontSize: 11, color: theme.textMuted }}>
          {currentQuarter()}
        </span>
        <span aria-label={`${taskCount} tasks total`} style={{ padding: '4px 10px', borderRadius: 6, background: theme.bgMuted, border: `1px solid ${theme.border}`, fontSize: '10.5px', fontFamily: FONT_MONO, fontWeight: 600, color: theme.textMuted }}>
          {taskCount} tasks
        </span>
        {onImportExport && (
          <button
            onClick={onImportExport}
            aria-label="Import or export data"
            style={{ padding: '6px 14px', borderRadius: 8, border: `1px solid ${theme.border}`, background: 'transparent', color: theme.textMuted, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            {'\u{1F4C1}'} Import/Export
          </button>
        )}
        {perms.canCreate && (
          <button
            onClick={() => {
              navigate('/tasks');
              onCreateTask();
            }}
            aria-label="Create new task"
            style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: PRIMARY_COLOR, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
          >
            + Task
          </button>
        )}
      </div>
    </header>
  );
}
