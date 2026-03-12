import { useState, type ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { ToastContainer } from '../toast/ToastContainer';
import { ActivityLog } from '../activity/ActivityLog';
import { PersonaPanel } from '../dev/PersonaPanel';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useActivityLog } from '../../context/ActivityLogContext';
import { useStore } from '../../store/store';
import { generateStressTasks } from '../../utils';

interface AppShellProps {
  children: ReactNode;
  onCreateTask?: () => void;
}

export function AppShell({ children, onCreateTask }: AppShellProps) {
  const { dark, setDark, theme } = useTheme();
  const { currentUser, setCurrentUser, permissions } = useAuth();
  const { toast } = useToast();
  const { log, logAction } = useActivityLog();
  const tasks = useStore((s) => s.tasks);
  const addBulkTasks = useStore((s) => s.addBulkTasks);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [logOpen, setLogOpen] = useState(false);

  const handleStress = () => {
    const st = generateStressTasks(60);
    addBulkTasks(st);
    toast('\u{1F525} Stress test: +60 tasks added!', '#ef4444', '\u{1F525}');
    logAction('Stress test triggered (+60 tasks)', currentUser.name, '#ef4444');
  };

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        fontFamily: "'DM Sans','Segoe UI',system-ui,sans-serif",
        background: theme.bg,
        color: theme.text,
        transition: 'background .3s,color .3s',
      }}
    >
      <Sidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        theme={theme}
        user={currentUser}
        actLogCount={log.length}
        onOpenLog={() => setLogOpen(true)}
      />

      <main style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        <Header theme={theme} taskCount={tasks.length} perms={permissions} onCreateTask={onCreateTask || (() => {})} />
        <div style={{ padding: 28, flex: 1 }}>{children}</div>
      </main>

      <ActivityLog log={log} open={logOpen} onClose={() => setLogOpen(false)} theme={theme} />
      <ToastContainer />
      <PersonaPanel
        currentUser={currentUser}
        setCurrentUser={(u) => {
          setCurrentUser(u);
          toast(`Switched to ${u.name}`, '#8b5cf6', '\u{1F464}');
          logAction(`Persona switched to ${u.name} (${u.role})`, u.name, '#8b5cf6');
        }}
        dark={dark}
        setDark={(d) => {
          setDark(d);
          toast(d ? 'Dark mode enabled' : 'Light mode enabled', d ? '#1e293b' : '#f59e0b', d ? '\u{1F319}' : '\u2600\uFE0F');
        }}
        theme={theme}
        onStress={handleStress}
      />
    </div>
  );
}
