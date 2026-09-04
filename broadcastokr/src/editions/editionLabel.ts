import type { TenancyMode } from './entitlements';
import { COLOR_WARNING, PRIMARY_GRADIENT } from '../constants/config';

/**
 * R6-6 — say which edition this is. One value (`mode`, the bridge's health
 * over the build edition) feeds the sign-in card, the sidebar brand and the
 * document title, so the MGX Cockpit and a client instance never look alike
 * ten minutes into a demo.
 */
export interface EditionLabel {
  /** Short human label — "MGX Cockpit", "Client · VRT", "Client instance", "Desktop". */
  name: string;
  /** Brand-block accent: the cockpit gets its own colour so it differs at a glance. */
  accent: string;
  /** Brand icon background. */
  iconBackground: string;
  /** Whether this is an edition worth calling out (cloud) or the quiet desktop default. */
  cloud: boolean;
}

const COCKPIT_GRADIENT = `linear-gradient(135deg, ${COLOR_WARNING} 0%, #FBBF24 100%)`;

export function editionLabel(mode: TenancyMode, clientName?: string | null): EditionLabel {
  switch (mode) {
    case 'cockpit':
      return { name: 'MGX Cockpit', accent: COLOR_WARNING, iconBackground: COCKPIT_GRADIENT, cloud: true };
    case 'client': {
      const trimmed = clientName?.trim();
      return {
        name: trimmed ? `Client · ${trimmed}` : 'Client instance',
        accent: '#9BAAC4',
        iconBackground: PRIMARY_GRADIENT,
        cloud: true,
      };
    }
    default:
      return { name: 'Desktop', accent: '#3D4F68', iconBackground: PRIMARY_GRADIENT, cloud: false };
  }
}

/** Browser tab / taskbar title: the edition first, so it reads even when truncated. */
export function editionTitle(mode: TenancyMode, clientName?: string | null): string {
  const label = editionLabel(mode, clientName);
  return label.cloud ? `${label.name} — BroadcastOKR` : 'BroadcastOKR';
}
