/**
 * The ONLY bridge module that reads BRIDGE_MODE (enforced by test).
 * desktop — today's behavior, everything mounted.
 * client  — single-tenant instance: fleet operations refused server-side.
 * cockpit — fleet mode behind cloud auth (Tier 1+).
 */
const raw = process.env.BRIDGE_MODE;
const MODE = raw === 'client' || raw === 'cockpit' ? raw : 'desktop';

module.exports = {
  MODE,
  isFleetAllowed: MODE !== 'client',
};
