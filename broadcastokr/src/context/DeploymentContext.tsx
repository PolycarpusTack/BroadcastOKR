import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { hasFeature, type Feature, type TenancyMode } from '../editions/entitlements';

interface DeploymentContextValue {
  mode: TenancyMode;
  can: (feature: Feature) => boolean;
}

// Absence of a provider means desktop — the zero-config default every
// existing render path (and test) already assumes.
const DeploymentContext = createContext<DeploymentContextValue>({
  mode: 'desktop',
  can: (f: Feature) => hasFeature(f, 'desktop'),
});

/** Mode is owned by App (build edition, overridden by the bridge's health.mode). */
export function DeploymentProvider({ mode, children }: { mode: TenancyMode; children: ReactNode }) {
  const value = useMemo(() => ({ mode, can: (f: Feature) => hasFeature(f, mode) }), [mode]);
  return <DeploymentContext.Provider value={value}>{children}</DeploymentContext.Provider>;
}

export function useDeployment() {
  return useContext(DeploymentContext);
}
