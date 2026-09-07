import type { Theme } from '../../../types';
import { FONT_BODY } from '../../../constants/config';

/** The wizard's body paragraph, shared by every step. */
export function paragraphStyle(theme: Theme, marginBottom = 12) {
  return { fontSize: 13, fontFamily: FONT_BODY, color: theme.textSecondary, lineHeight: 1.6, margin: `0 0 ${marginBottom}px 0` };
}
