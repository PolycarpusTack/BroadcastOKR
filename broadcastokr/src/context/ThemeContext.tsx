import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { Theme } from '../types';
import { THEMES } from '../constants';

interface ThemeContextValue {
  dark: boolean;
  setDark: (dark: boolean) => void;
  theme: Theme;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(false);
  const theme = dark ? THEMES.dark : THEMES.light;

  useEffect(() => {
    document.body.className = dark ? 'dark' : '';
  }, [dark]);

  return (
    <ThemeContext.Provider value={{ dark, setDark, theme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
