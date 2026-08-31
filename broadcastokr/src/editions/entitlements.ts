/**
 * The ONLY module that reads VITE_EDITION (enforced by lint). Everything else
 * gates through hasFeature() / the DeploymentContext — one diffable map is the
 * whole difference between editions.
 *
 * Build edition governs what's in the bundle (client builds tree-shake fleet
 * chunks); runtime mode — served by the bridge via /api/health — governs
 * behavior, so one full build serves both desktop and cockpit.
 */
export type TenancyMode = 'desktop' | 'client' | 'cockpit';
export type Feature = 'fleet' | 'personaPanel';

const FEATURES: Record<TenancyMode, Record<Feature, boolean>> = {
  desktop: { fleet: true, personaPanel: true },
  client: { fleet: false, personaPanel: false },
  cockpit: { fleet: true, personaPanel: false },
};

function normalize(value: unknown): TenancyMode | null {
  // The build matrix calls the full cloud build "internal"; its runtime mode is cockpit.
  if (value === 'internal') return 'cockpit';
  return value === 'desktop' || value === 'client' || value === 'cockpit' ? value : null;
}

export const BUILD_EDITION: TenancyMode = normalize(import.meta.env.VITE_EDITION) ?? 'desktop';

/**
 * Statically foldable (direct env comparison, no function call) so Rollup can
 * dead-code-eliminate fleet page chunks out of client-edition bundles.
 */
export const FLEET_IN_BUILD: boolean = import.meta.env.VITE_EDITION !== 'client';

let runtimeMode: TenancyMode = BUILD_EDITION;

/** Fed from /api/health by App; non-modes are ignored. */
export function setRuntimeMode(mode: unknown): void {
  const normalized = normalize(mode);
  if (normalized) runtimeMode = normalized;
}

export function getRuntimeMode(): TenancyMode {
  return runtimeMode;
}

export function hasFeature(feature: Feature, mode: TenancyMode = runtimeMode): boolean {
  return FEATURES[mode][feature];
}
