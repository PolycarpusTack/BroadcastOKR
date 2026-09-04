/**
 * The ONLY bridge module that reads BRIDGE_MODE (enforced by test) — and,
 * since R3, the licence: BRIDGE_TIER and the BRIDGE_CAP_* values.
 *
 * Mode:
 * desktop — today's behavior, everything mounted.
 * client  — single-tenant instance: fleet operations refused server-side.
 * cockpit — fleet mode behind cloud auth (Tier 1+).
 *
 * Tier (R3, decision 2026-09-04): starter = manual KRs and check-ins; pro adds
 * live KRs (bridge and agent), templates, agents; enterprise adds the
 * Mediagenix sharing channel. Desktop and the cockpit are unrestricted. The
 * licence is plain values in the provisioned env: instances run in
 * Mediagenix's cloud, so the env is operator-controlled (a signed licence is
 * recorded as a residual for instances outside that control). Caps are
 * numbers, separate from the tier; unset = unlimited.
 * src/editions/entitlements.ts mirrors TIER_FEATURES; an equality test pins it.
 */
const raw = process.env.BRIDGE_MODE;
const MODE = raw === 'client' || raw === 'cockpit' ? raw : 'desktop';

const TIERS = ['starter', 'pro', 'enterprise'];
const TIER_FEATURES = {
  starter: { liveKRs: false, agents: false, templates: false, sharing: false },
  pro: { liveKRs: true, agents: true, templates: true, sharing: false },
  enterprise: { liveKRs: true, agents: true, templates: true, sharing: true },
};

const rawTier = process.env.BRIDGE_TIER;
const TIER_CONFIGURED = TIERS.includes(rawTier) ? rawTier : null;
// Only a client instance is licensed; desktop is single-user, the cockpit is Mediagenix's own.
const TIER = MODE === 'client' ? (TIER_CONFIGURED || 'enterprise') : 'enterprise';
const ENTITLEMENTS = TIER_FEATURES[TIER];

const cap = (name) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
};
const CAPS = MODE === 'client'
  ? { channels: cap('BRIDGE_CAP_CHANNELS'), seats: cap('BRIDGE_CAP_SEATS'), agents: cap('BRIDGE_CAP_AGENTS') }
  : { channels: null, seats: null, agents: null };

module.exports = {
  MODE,
  isFleetAllowed: MODE !== 'client',
  TIERS,
  TIER_FEATURES,
  TIER,
  /** Null when a client instance runs without BRIDGE_TIER (it then runs as enterprise, and says so at startup). */
  TIER_CONFIGURED,
  ENTITLEMENTS,
  CAPS,
  hasEntitlement: (feature) => !!ENTITLEMENTS[feature],
};
