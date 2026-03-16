import { createContext, useContext, useState, useCallback, useRef, useMemo, type ReactNode } from 'react';
import type { ActivityEntry } from '../types';
import { formatTime } from '../utils';
import { PRIMARY_COLOR } from '../constants/config';

interface ActivityLogContextValue {
  log: ActivityEntry[];
  logAction: (text: string, userName: string, color?: string) => void;
}

const ActivityLogContext = createContext<ActivityLogContextValue | null>(null);

export function ActivityLogProvider({ children }: { children: ReactNode }) {
  const [log, setLog] = useState<ActivityEntry[]>([]);
  const idRef = useRef(0);

  const logAction = useCallback((text: string, userName: string, color?: string) => {
    const id = ++idRef.current;
    setLog((prev) =>
      [{ id, text, user: userName, time: formatTime(), color: color || PRIMARY_COLOR }, ...prev].slice(0, 100),
    );
  }, []);

  const value = useMemo(() => ({ log, logAction }), [log, logAction]);

  return (
    <ActivityLogContext.Provider value={value}>
      {children}
    </ActivityLogContext.Provider>
  );
}

export function useActivityLog() {
  const ctx = useContext(ActivityLogContext);
  if (!ctx) throw new Error('useActivityLog must be used within ActivityLogProvider');
  return ctx;
}
