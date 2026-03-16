import type { Theme } from '../types';
import { FONT_BODY } from '../constants/config';

export function inputStyle(theme: Theme) {
  return {
    width: '100%',
    padding: '8px 12px',
    borderRadius: 6,
    border: `1px solid ${theme.border}`,
    background: theme.bgInput,
    color: theme.text,
    fontSize: '12.5px',
    fontFamily: FONT_BODY,
    outline: 'none',
    boxSizing: 'border-box' as const,
  };
}

export function labelStyle(theme: Theme) {
  return {
    fontSize: 11,
    fontWeight: 600 as const,
    color: theme.textMuted,
    marginBottom: 4,
    display: 'block' as const,
  };
}

export function buttonStyle(bg: string, disabled = false) {
  return {
    background: disabled ? '#555' : bg,
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '8px 16px',
    fontSize: 12,
    fontWeight: 600 as const,
    cursor: disabled ? 'not-allowed' as const : 'pointer' as const,
    fontFamily: FONT_BODY,
    opacity: disabled ? 0.6 : 1,
  };
}
