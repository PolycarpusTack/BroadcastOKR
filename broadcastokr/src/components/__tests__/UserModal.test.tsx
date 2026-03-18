import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UserModal } from '../team/UserModal';
import type { Theme, User, Client } from '../../types';

const theme: Theme = {
  bg: '#fff', bgCard: '#fff', bgCardHover: '#f5f5f5', bgSidebar: '#f5f5f5',
  bgSidebarActive: '#eee', bgInput: '#fff', bgMuted: '#f5f5f5', border: '#ddd',
  borderLight: '#eee', borderInput: '#ccc', text: '#000', textSecondary: '#666',
  textMuted: '#999', textFaint: '#bbb', sidebarText: '#333', sidebarTextActive: '#000',
  overlay: 'rgba(0,0,0,0.5)', headerBg: '#fff', compliantBg: '#e6ffed',
  compliantBorder: '#10b981', atRiskBg: '#fff3cd', atRiskBorder: '#f59e0b',
};

const mockClients: Client[] = [
  { id: 'c1', name: 'VRT', connectionId: '', color: '#3805E3', channels: [] },
  { id: 'c2', name: 'Mediagenix', connectionId: '', color: '#2DD4BF', channels: [] },
];

const mockUser: User = {
  id: 1,
  name: 'Jane Smith',
  av: 'JS',
  role: 'manager',
  dept: 'Engineering',
  title: 'Senior Engineer',
  color: '#F59E0B',
  email: 'jane@example.com',
  phone: '+32 123 456',
  avatarUrl: 'https://example.com/jane.png',
  clientIds: ['c1'],
  skills: ['React', 'TypeScript'],
};

const mockUsers: User[] = [
  mockUser,
  { id: 2, name: 'John Doe', av: 'JD', role: 'member', dept: 'Design', title: 'Designer', color: '#6366F1' },
];

const baseProps = {
  open: true,
  onClose: vi.fn(),
  theme,
  clients: mockClients,
  onSave: vi.fn(),
  users: mockUsers,
  taskCount: 3,
  goalCount: 2,
  teamLeadCount: 1,
};

describe('UserModal', () => {
  it('renders empty fields in add mode', () => {
    render(<UserModal {...baseProps} />);

    // Modal title (h3) should say "Add Member"
    expect(screen.getByRole('heading', { name: 'Add Member' })).toBeInTheDocument();

    const nameInput = screen.getByPlaceholderText('e.g. Jane Smith') as HTMLInputElement;
    expect(nameInput.value).toBe('');

    const initialsInput = screen.getByPlaceholderText('JS') as HTMLInputElement;
    expect(initialsInput.value).toBe('');

    const emailInput = screen.getByPlaceholderText('jane.smith@example.com') as HTMLInputElement;
    expect(emailInput.value).toBe('');

    const phoneInput = screen.getByPlaceholderText('+32 xxx xx xx xx') as HTMLInputElement;
    expect(phoneInput.value).toBe('');

    const roleSelect = screen.getByDisplayValue('Member') as HTMLSelectElement;
    expect(roleSelect.value).toBe('member');
  });

  it('renders pre-filled fields in edit mode', () => {
    render(<UserModal {...baseProps} user={mockUser} />);

    expect(screen.getByRole('heading', { name: 'Edit Member' })).toBeInTheDocument();

    const nameInput = screen.getByPlaceholderText('e.g. Jane Smith') as HTMLInputElement;
    expect(nameInput.value).toBe('Jane Smith');

    const initialsInput = screen.getByPlaceholderText('JS') as HTMLInputElement;
    expect(initialsInput.value).toBe('JS');

    const emailInput = screen.getByPlaceholderText('jane.smith@example.com') as HTMLInputElement;
    expect(emailInput.value).toBe('jane@example.com');

    const phoneInput = screen.getByPlaceholderText('+32 xxx xx xx xx') as HTMLInputElement;
    expect(phoneInput.value).toBe('+32 123 456');

    const roleSelect = screen.getByDisplayValue('Manager') as HTMLSelectElement;
    expect(roleSelect.value).toBe('manager');

    const skillsInput = screen.getByPlaceholderText('e.g. React, TypeScript, SQL') as HTMLInputElement;
    expect(skillsInput.value).toBe('React, TypeScript');

    // VRT client should be checked
    const vrtCheckbox = screen.getByRole('checkbox', { name: /VRT/i }) as HTMLInputElement;
    expect(vrtCheckbox.checked).toBe(true);

    // Mediagenix should not be checked
    const mediagenixCheckbox = screen.getByRole('checkbox', { name: /Mediagenix/i }) as HTMLInputElement;
    expect(mediagenixCheckbox.checked).toBe(false);
  });

  it('auto-derives initials from name change', () => {
    render(<UserModal {...baseProps} />);

    const nameInput = screen.getByPlaceholderText('e.g. Jane Smith');
    fireEvent.change(nameInput, { target: { value: 'Alice Bob Carter' } });

    const initialsInput = screen.getByPlaceholderText('JS') as HTMLInputElement;
    expect(initialsInput.value).toBe('ABC');

    // Changing to a single word
    fireEvent.change(nameInput, { target: { value: 'Alice' } });
    expect(initialsInput.value).toBe('A');

    // After manually editing initials, name change should not override
    fireEvent.change(initialsInput, { target: { value: 'XY' } });
    fireEvent.change(nameInput, { target: { value: 'Alice Bob' } });
    // initials were manually set, should remain XY
    expect(initialsInput.value).toBe('XY');
  });

  it('shows delete section only in edit mode', () => {
    const { rerender } = render(<UserModal {...baseProps} onDelete={vi.fn()} />);

    // Add mode — no delete button
    expect(screen.queryByText('Delete this member')).not.toBeInTheDocument();
    expect(screen.queryByText('Delete')).not.toBeInTheDocument();

    // Edit mode — delete section appears
    rerender(<UserModal {...baseProps} user={mockUser} onDelete={vi.fn()} />);
    expect(screen.getByText('Delete this member')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();

    // Click delete button — confirmation appears
    fireEvent.click(screen.getByText('Delete'));
    expect(screen.getByText(/3 tasks, 2 goals, 1 team lead role will be affected/)).toBeInTheDocument();
    expect(screen.getByText('Confirm Delete')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Leave unassigned')).toBeInTheDocument();
  });
});
