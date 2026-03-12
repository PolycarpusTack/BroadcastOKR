import { useTheme } from '../context/ThemeContext';

export function GoalsPage() {
  const { theme } = useTheme();
  return (
    <div style={{ padding: 28, background: theme.bg, minHeight: '100vh', color: theme.text }}>
      <h1 style={{ fontSize: 22, fontWeight: 800 }}>Goals</h1>
      <p style={{ color: theme.textMuted, marginTop: 8 }}>Phase 2: Goals components coming soon.</p>
    </div>
  );
}
