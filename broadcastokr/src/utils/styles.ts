import type { Theme } from '../types';

export function selectStyle(theme: Theme) {
  return {
    padding: '6px 10px',
    borderRadius: 8,
    border: `1px solid ${theme.borderInput}`,
    background: theme.bgInput,
    color: theme.text,
    fontSize: 12,
    outline: 'none',
  } as const;
}

export function cardStyle(theme: Theme) {
  return {
    background: theme.bgCard,
    border: `1px solid ${theme.border}`,
    borderRadius: 14,
    padding: 20,
  } as const;
}
