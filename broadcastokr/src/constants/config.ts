/** App-wide configuration constants */

import { BUILD_EDITION } from '../editions/entitlements';

/** Primary brand color used across UI */
export const PRIMARY_COLOR = '#3805E3';
export const PRIMARY_GRADIENT = 'linear-gradient(135deg, #3805E3 0%, #5B33F0 100%)';

/**
 * Bridge service defaults. The desktop edition talks to a bridge on its own
 * port; the cloud editions are *served by* their bridge (BRIDGE_APP_DIR), so
 * the API is same-origin — a leaked ':3001' default there left a provisioned
 * instance unable to reach itself (R1 rig, 2026-09-03). VITE_BRIDGE_URL still
 * overrides both, and an explicit empty string means same-origin.
 */
const DEFAULT_BRIDGE_URL = BUILD_EDITION === 'desktop' ? 'http://localhost:3001' : '';
export const BRIDGE_URL: string = import.meta.env.VITE_BRIDGE_URL ?? DEFAULT_BRIDGE_URL;
export const BRIDGE_API_KEY = import.meta.env.VITE_BRIDGE_API_KEY || '';
export const BRIDGE_POLL_INTERVAL_MS = 900_000; // 15 minutes
/** Live KR data older than this is flagged stale in the UI (4 missed polls) */
export const STALE_SYNC_THRESHOLD_MS = 3_600_000; // 60 minutes

/** Status colors */
export const COLOR_SUCCESS = '#2DD4BF';
export const COLOR_WARNING = '#F59E0B';
export const COLOR_DANGER = '#F87171';
export const COLOR_INFO = '#6366F1';
export const COLOR_COBALT_MID = '#5B33F0';

/** Database type badge colors */
export const COLOR_DB_POSTGRES = '#3B82F6';
export const COLOR_DB_ORACLE = '#F80000';

/** Sidebar border color */
export const COLOR_SIDEBAR_BORDER = '#1F2D45';

/** Font families */
export const FONT_BODY = "'IBM Plex Sans', sans-serif";
export const FONT_HEADING = "'Space Grotesk', sans-serif";
export const FONT_MONO = "'JetBrains Mono', monospace";

/**
 * Mirror of bridge/protocol.cjs PROTOCOL_VERSION (CJS/ESM split forces the
 * mirror); a vitest equality test pins the two. Sent as X-BrOKR-Protocol on
 * every bridge call.
 */
export const PROTOCOL_VERSION = 1;
