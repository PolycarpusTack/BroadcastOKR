import { useTheme } from '../context/ThemeContext';

export function TasksPage() {
  const { theme } = useTheme();
  return (
    <div style={{ padding: 28, background: theme.bg, minHeight: '100vh', color: theme.text }}>
      <h1 style={{ fontSize: 22, fontWeight: 800 }}>Tasks</h1>
      <p style={{ color: theme.textMuted, marginTop: 8 }}>Phase 2: Tasks components coming soon.</p>
    </div>
  );
}
