import { createContext, useContext, useState, type ReactNode } from 'react';
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

  return (
    <AuthContext.Provider value={{ currentUser, setCurrentUser, permissions }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
