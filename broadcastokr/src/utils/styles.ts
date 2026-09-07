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

/** The filter <select> at the top of each report view. */
export function reportSelectStyle(theme: Theme) {
  return {
    background: theme.bgInput,
    color: theme.text,
    border: `1px solid ${theme.borderInput}`,
    borderRadius: 8,
    padding: '6px 12px',
    fontSize: 13,
    fontFamily: FONT_BODY,
    cursor: 'pointer',
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
