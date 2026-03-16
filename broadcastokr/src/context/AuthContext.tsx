import { createContext, useContext, useState, useMemo, type ReactNode } from 'react';
import type { User, RolePermissions } from '../types';
import { USERS, ROLE_PERMS } from '../constants';

interface AuthContextValue {
  currentUser: User;
  setCurrentUser: (user: User) => void;
  permissions: RolePermissions;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User>(USERS[0]);
  const permissions = ROLE_PERMS[currentUser.role];

  const value = useMemo(() => ({ currentUser, setCurrentUser, permissions }), [currentUser, permissions]);

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
