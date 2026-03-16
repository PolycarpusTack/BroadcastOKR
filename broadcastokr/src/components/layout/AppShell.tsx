import { useState, useCallback, type ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { ToastContainer } from '../toast/ToastContainer';
import { ActivityLog } from '../activity/ActivityLog';
import { PersonaPanel } from '../dev/PersonaPanel';
import { ImportExportModal } from '../data/ImportExportModal';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useActivityLog } from '../../context/ActivityLogContext';
import { useStore } from '../../store/store';
import { generateStressTasks } from '../../utils';
import { COLOR_DANGER, FONT_BODY } from '../../constants/config';

interface AppShellProps {
  children: ReactNode;
  onCreateTask?: () => void;
}

export function AppShell({ children, onCreateTask }: AppShellProps) {
  const { theme } = useTheme();
  const { currentUser, setCurrentUser, permissions } = useAuth();
  const { toast } = useToast();
  const { log, logAction } = useActivityLog();
  const taskCount = useStore((s) => s.tasks.length);
  const addBulkTasks = useStore((s) => s.addBulkTasks);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [importExportOpen, setImportExportOpen] = useState(false);

  const handleStress = () => {
    const st = generateStressTasks(60);
    addBulkTasks(st);
    toast('\u{1F525} Stress test: +60 tasks added!', COLOR_DANGER, '\u{1F525}');
    logAction('Stress test triggered (+60 tasks)', currentUser.name, COLOR_DANGER);
  };

  const closeMobileSidebar = useCallback(() => setMobileSidebarOpen(false), []);

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        fontFamily: FONT_BODY,
        background: theme.bg,
        color: theme.text,
        transition: 'background .3s,color .3s',
      }}
    >
      <a className="skip-link" href="#main-content">Skip to content</a>

      {/* Desktop sidebar */}
      <div className="sidebar-desktop">
        <Sidebar
          open={sidebarOpen}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
          theme={theme}
          user={currentUser}
          actLogCount={log.length}
          onOpenLog={() => setLogOpen(true)}
        />
      </div>

      {/* Mobile sidebar overlay */}
      {mobileSidebarOpen && (
        <div className="sidebar-mobile-overlay">
          <div
            onClick={closeMobileSidebar}
            onKeyDown={(e) => { if (e.key === 'Escape') closeMobileSidebar(); }}
            role="button"
            tabIndex={-1}
            aria-label="Close sidebar"
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 999 }}
          />
          <div style={{ position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 1000, width: 260 }}>
            <Sidebar
              open
              onToggle={closeMobileSidebar}
              theme={theme}
              user={currentUser}
              actLogCount={log.length}
              onOpenLog={() => { setLogOpen(true); closeMobileSidebar(); }}
            />
          </div>
        </div>
      )}

      <main id="main-content" role="main" style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        <Header
          theme={theme}
          taskCount={taskCount}
          perms={permissions}
          onCreateTask={onCreateTask || (() => {})}
          onMobileMenu={() => setMobileSidebarOpen(true)}
          onImportExport={() => setImportExportOpen(true)}
        />
        <div className="main-content" style={{ padding: 28, flex: 1 }}>{children}</div>
      </main>

      <ImportExportModal open={importExportOpen} onClose={() => setImportExportOpen(false)} theme={theme} />
      <ActivityLog log={log} open={logOpen} onClose={() => setLogOpen(false)} theme={theme} />
      <ToastContainer />
      {import.meta.env.DEV && (
        <PersonaPanel
          currentUser={currentUser}
          setCurrentUser={(u) => {
            setCurrentUser(u);
            toast(`Switched to ${u.name}`, '#A78BFA', '\u{1F464}');
            logAction(`Persona switched to ${u.name} (${u.role})`, u.name, '#A78BFA');
          }}
          theme={theme}
          onStress={handleStress}
        />
      )}
    </div>
  );
}
