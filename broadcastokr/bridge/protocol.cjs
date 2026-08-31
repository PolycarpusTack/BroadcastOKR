/**
 * The app↔bridge protocol contract. Three artifacts upgrade on different
 * cadences (desktop installers, client instances, site agents), so the wire
 * format is versioned: clients send X-BrOKR-Protocol; the bridge refuses
 * versions below MIN_SUPPORTED with 426.
 *
 * Rules (see docs/saas/2026-08-31-tiered-development-plan.md):
 * - Support window is N-2; MIN_SUPPORTED only advances by explicit decision.
 * - Within the window, payloads and schema change additively only (FF-6).
 * - src/constants/config.ts mirrors PROTOCOL_VERSION; an equality test pins it.
 */
const PROTOCOL_VERSION = 1;
const MIN_SUPPORTED = 1;

module.exports = { PROTOCOL_VERSION, MIN_SUPPORTED };
