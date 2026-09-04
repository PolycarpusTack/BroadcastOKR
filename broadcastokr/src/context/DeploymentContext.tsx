import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { hasFeature, hasEntitlement, type Feature, type TenancyMode, type Tier, type Entitlement } from '../editions/entitlements';

interface DeploymentContextValue {
  mode: TenancyMode;
  can: (feature: Feature) => boolean;
  /** The instance's licence tier (R3); desktop and the cockpit are enterprise. */
  tier: Tier;
  entitled: (feature: Entitlement) => boolean;
}

// Absence of a provider means desktop — the zero-config default every
// existing render path (and test) already assumes.
const DeploymentContext = createContext<DeploymentContextValue>({
  mode: 'desktop',
  can: (f: Feature) => hasFeature(f, 'desktop'),
  tier: 'enterprise',
  entitled: (f: Entitlement) => hasEntitlement(f, 'enterprise'),
});

/** Mode and tier are owned by App (build edition, overridden by the bridge's health). */
export function DeploymentProvider({ mode, tier = 'enterprise', children }: { mode: TenancyMode; tier?: Tier; children: ReactNode }) {
  const value = useMemo(() => ({
    mode,
    can: (f: Feature) => hasFeature(f, mode),
    tier,
    // Reads the runtime map (fed from health) so a bridge-side override wins over the tier default
    entitled: (f: Entitlement) => hasEntitlement(f),
  }), [mode, tier]);
  return <DeploymentContext.Provider value={value}>{children}</DeploymentContext.Provider>;
}

export function useDeployment() {
  return useContext(DeploymentContext);
}
