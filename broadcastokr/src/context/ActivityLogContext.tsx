import { createContext, useContext, useState, useCallback, useRef, useMemo, type ReactNode } from 'react';
import type { ActivityEntry } from '../types';
import { formatTime } from '../utils';
import { PRIMARY_COLOR } from '../constants/config';
import { bridgePost, bridgeWriteFailed } from '../store/bridgeSync';

interface ActivityLogContextValue {
  log: ActivityEntry[];
  logAction: (text: string, userName: string, color?: string) => void;
  /** Replace the in-memory log with entries persisted on the bridge */
  hydrateLog: (entries: Array<{ id: number; timestamp: string; actor: string; text: string; color: string | null }>) => void;
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
    bridgePost('/api/activity', { actor: userName, text, color }).catch(bridgeWriteFailed);
  }, []);

  const hydrateLog = useCallback((entries: Array<{ id: number; timestamp: string; actor: string; text: string; color: string | null }>) => {
    // Server rows are UTC "YYYY-MM-DD HH:MM:SS"; render in local time
    setLog(entries.map((e) => ({
      id: e.id,
      text: e.text,
      user: e.actor,
      time: formatTime(new Date(e.timestamp.includes('T') ? e.timestamp : `${e.timestamp.replace(' ', 'T')}Z`)),
      color: e.color || PRIMARY_COLOR,
    })));
    idRef.current = Math.max(0, ...entries.map((e) => e.id));
  }, []);

  const value = useMemo(() => ({ log, logAction, hydrateLog }), [log, logAction, hydrateLog]);

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
