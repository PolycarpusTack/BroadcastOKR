import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { ActivityEntry } from '../types';
import { formatTime } from '../utils';

interface ActivityLogContextValue {
  log: ActivityEntry[];
  logAction: (text: string, userName: string, color?: string) => void;
}

const ActivityLogContext = createContext<ActivityLogContextValue | null>(null);

export function ActivityLogProvider({ children }: { children: ReactNode }) {
  const [log, setLog] = useState<ActivityEntry[]>([]);

  const logAction = useCallback((text: string, userName: string, color?: string) => {
    setLog((prev) =>
      [{ text, user: userName, time: formatTime(), color: color || '#4f46e5' }, ...prev].slice(0, 100),
    );
  }, []);

  return (
    <ActivityLogContext.Provider value={{ log, logAction }}>
      {children}
    </ActivityLogContext.Provider>
  );
}

export function useActivityLog() {
  const ctx = useContext(ActivityLogContext);
  if (!ctx) throw new Error('useActivityLog must be used within ActivityLogProvider');
  return ctx;
}
