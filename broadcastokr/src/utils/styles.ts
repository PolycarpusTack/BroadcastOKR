import type { Theme } from '../types';
import { FONT_BODY } from '../constants/config';

export function selectStyle(theme: Theme) {
  return {
    padding: '8px 12px',
    borderRadius: 6,
    border: `1px solid ${theme.border}`,
    background: theme.bgInput,
    color: theme.text,
    fontSize: '12.5px',
    fontFamily: FONT_BODY,
    outline: 'none',
  } as const;
}

export function cardStyle(theme: Theme) {
  return {
    background: theme.bgCard,
    border: `1px solid ${theme.border}`,
    borderRadius: 10,
    padding: 20,
  } as const;
}
