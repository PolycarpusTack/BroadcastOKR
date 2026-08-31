import { createContext, useContext, useState, useEffect, useMemo, type ReactNode } from 'react';
import type { User, RolePermissions } from '../types';
import { ROLE_PERMS } from '../constants';
import { useStore } from '../store/store';
import { bridgeFetch, bridgePost } from '../store/bridgeSync';
import { BUILD_EDITION } from '../editions/entitlements';
import { BRIDGE_URL } from '../constants/config';

export type AuthStatus = 'loading' | 'unauthenticated' | 'ready';

interface AuthContextValue {
  currentUser: User;
  /** Desktop persona switch; a no-op in cloud editions (identity is server-owned) */
  setCurrentUser: (user: User) => void;
  permissions: RolePermissions;
  /** Cloud editions only — desktop is always 'ready' */
  authStatus: AuthStatus;
  signIn: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Cloud builds get their identity from the bridge session, not a persona.
const IS_CLOUD = BUILD_EDITION !== 'desktop';

interface MeResponse {
  user: { id: number; name: string; role: User['role']; av: string; color: string; dept: string; title: string; email?: string };
  permissions: RolePermissions;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const users = useStore((s) => s.users);
  const [personaUser, setPersonaUser] = useState<User>(users[0]);
  const [serverUser, setServerUser] = useState<User | null>(null);
  const [serverPerms, setServerPerms] = useState<RolePermissions | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>(IS_CLOUD ? 'loading' : 'ready');

  useEffect(() => {
    if (!IS_CLOUD) return;
    let cancelled = false;
    bridgeFetch<MeResponse>('/api/auth/me', undefined, { retries: 0 })
      .then(({ user, permissions }) => {
        if (cancelled) return;
        setServerUser({ ...user, email: user.email });
        setServerPerms(permissions);
        setAuthStatus('ready');
      })
      .catch(() => { if (!cancelled) setAuthStatus('unauthenticated'); });

    // The unified client reports 401s (e.g. session expiry mid-use)
    const onUnauthenticated = () => setAuthStatus('unauthenticated');
    window.addEventListener('bridge-unauthenticated', onUnauthenticated);
    return () => {
      cancelled = true;
      window.removeEventListener('bridge-unauthenticated', onUnauthenticated);
    };
  }, []);

  const currentUser = IS_CLOUD ? (serverUser ?? personaUser) : personaUser;
  const permissions = IS_CLOUD && serverPerms ? serverPerms : ROLE_PERMS[currentUser.role];

  const value = useMemo<AuthContextValue>(() => ({
    currentUser,
    setCurrentUser: IS_CLOUD ? () => {} : setPersonaUser,
    permissions,
    authStatus,
    signIn: () => { window.location.href = `${BRIDGE_URL}/api/auth/login`; },
    signOut: async () => {
      await bridgePost('/api/auth/logout', {}).catch(() => {});
      setAuthStatus('unauthenticated');
    },
  }), [currentUser, permissions, authStatus]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
