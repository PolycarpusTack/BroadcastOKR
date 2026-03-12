import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { Toast } from '../types';

interface ToastContextValue {
  toasts: Toast[];
  toast: (text: string, bg?: string, icon?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((text: string, bg?: string, icon?: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, text, bg: bg || '#10b981', icon: icon || '\u2705', exiting: false }]);
    setTimeout(() => setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))), 2500);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2800);
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, toast }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
