import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// Cloud builds take identity from /api/auth/me instead of the persona switch.

const mockMe = vi.fn();
vi.mock('../../editions/entitlements', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../editions/entitlements')>(),
  BUILD_EDITION: 'client',
}));
vi.mock('../../store/bridgeSync', () => ({
  bridgeFetch: (...args: unknown[]) => mockMe(...args),
  bridgePost: vi.fn().mockResolvedValue({ ok: true }),
  bridgePut: vi.fn().mockResolvedValue({ ok: true }),
  bridgePutEntity: vi.fn().mockResolvedValue(undefined),
  bridgeDelete: vi.fn().mockResolvedValue({ ok: true }),
  bridgeWriteFailed: vi.fn(),
}));
import { AuthProvider, useAuth } from '../AuthContext';

afterEach(() => {
  vi.clearAllMocks();
});

describe('AuthContext in a cloud build', () => {
  it('adopts the server identity and permissions when /me succeeds', async () => {
    mockMe.mockResolvedValue({
      user: { id: 9, name: 'Server Sam', role: 'manager', av: 'SS', color: '#000', dept: '', title: '' },
      permissions: { canCreate: true, canEdit: true, canDelete: false, canAssign: true, canCheckIn: true, canChangeStatus: true, canViewReports: true, label: 'Manager' },
    });

    function Shows() {
      const { currentUser, permissions, authStatus } = useAuth();
      return <div>{authStatus}:{currentUser.name}:{String(permissions.canDelete)}</div>;
    }
    render(<AuthProvider><Shows /></AuthProvider>);

    await waitFor(() => expect(screen.getByText('ready:Server Sam:false')).toBeTruthy());
    expect(mockMe).toHaveBeenCalledWith('/api/auth/me', undefined, { retries: 0 });
  });

  it('flips to unauthenticated when /me is refused', async () => {
    mockMe.mockRejectedValue(new Error('401'));

    function Shows() {
      const { authStatus } = useAuth();
      return <div>status:{authStatus}</div>;
    }
    render(<AuthProvider><Shows /></AuthProvider>);

    await waitFor(() => expect(screen.getByText('status:unauthenticated')).toBeTruthy());
  });
});
