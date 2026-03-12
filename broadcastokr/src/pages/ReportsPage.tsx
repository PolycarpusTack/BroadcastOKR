import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';

export function ReportsPage() {
  const { theme } = useTheme();
  const { permissions } = useAuth();

  if (!permissions.canViewReports) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, flexDirection: 'column', gap: 12, minHeight: '100vh', background: theme.bg }}>
        <span style={{ fontSize: 48 }}>{'\u{1F512}'}</span>
        <div style={{ fontSize: 16, fontWeight: 700, color: theme.text }}>Reports Restricted</div>
        <div style={{ fontSize: 13, color: theme.textMuted, textAlign: 'center', maxWidth: 300 }}>
          Switch to an owner or manager persona using the control panel.
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 28, background: theme.bg, minHeight: '100vh', color: theme.text }}>
      <h1 style={{ fontSize: 22, fontWeight: 800 }}>Reports</h1>
      <p style={{ color: theme.textMuted, marginTop: 8 }}>Phase 2: Reports components coming soon.</p>
    </div>
  );
}
