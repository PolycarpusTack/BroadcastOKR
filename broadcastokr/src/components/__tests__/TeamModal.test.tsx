import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TeamModal } from '../team/TeamModal';
import type { Theme, User, Client, Team } from '../../types';

const theme: Theme = {
  bg: '#fff', bgCard: '#fff', bgCardHover: '#f5f5f5', bgSidebar: '#f5f5f5',
  bgSidebarActive: '#eee', bgInput: '#fff', bgMuted: '#f5f5f5', border: '#ddd',
  borderLight: '#eee', borderInput: '#ccc', text: '#000', textSecondary: '#666',
  textMuted: '#999', textFaint: '#bbb', sidebarText: '#333', sidebarTextActive: '#000',
  overlay: 'rgba(0,0,0,0.5)', headerBg: '#fff', compliantBg: '#e6ffed',
  compliantBorder: '#10b981', atRiskBg: '#fff3cd', atRiskBorder: '#f59e0b',
};

const mockUsers: User[] = [
  { id: 1, name: 'Jane Smith', av: 'JS', role: 'manager', dept: 'Engineering', title: 'Senior Engineer', color: '#F59E0B' },
  { id: 2, name: 'John Doe', av: 'JD', role: 'member', dept: 'Design', title: 'Designer', color: '#6366F1' },
  { id: 3, name: 'Alice Brown', av: 'AB', role: 'member', dept: 'QA', title: 'QA Engineer', color: '#10B981' },
];

const mockClients: Client[] = [
  { id: 'c1', name: 'VRT', connectionId: '', color: '#3805E3', channels: [] },
  { id: 'c2', name: 'Mediagenix', connectionId: '', color: '#2DD4BF', channels: [] },
];

const mockTeam: Team = {
  id: 'team-1',
  name: 'Frontend Team',
  icon: '🖥️',
  color: '#6366F1',
  members: [1, 2],
  leadId: 1,
  clientIds: ['c1'],
};

const baseProps = {
  open: true,
  onClose: vi.fn(),
  theme,
  users: mockUsers,
  clients: mockClients,
  onSave: vi.fn(),
};

describe('TeamModal', () => {
  it('renders member checkboxes from users list', () => {
    render(<TeamModal {...baseProps} />);

    // All users should appear as checkboxes
    const janeCheckbox = screen.getByRole('checkbox', { name: /Jane Smith/i }) as HTMLInputElement;
    const johnCheckbox = screen.getByRole('checkbox', { name: /John Doe/i }) as HTMLInputElement;
    const aliceCheckbox = screen.getByRole('checkbox', { name: /Alice Brown/i }) as HTMLInputElement;

    expect(janeCheckbox).toBeInTheDocument();
    expect(johnCheckbox).toBeInTheDocument();
    expect(aliceCheckbox).toBeInTheDocument();

    // In add mode, none are checked
    expect(janeCheckbox.checked).toBe(false);
    expect(johnCheckbox.checked).toBe(false);
    expect(aliceCheckbox.checked).toBe(false);
  });

  it('lead dropdown only shows selected members', () => {
    render(<TeamModal {...baseProps} />);

    // Initially no members selected — lead select should be disabled
    const leadSelect = screen.getByRole('combobox', { name: /lead/i }) as HTMLSelectElement;
    expect(leadSelect).toBeDisabled();

    // Select Jane Smith as a member
    fireEvent.click(screen.getByRole('checkbox', { name: /Jane Smith/i }));

    // Lead select should now be enabled and contain Jane but not others
    expect(leadSelect).not.toBeDisabled();
    expect(screen.getByRole('option', { name: 'Jane Smith' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'John Doe' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Alice Brown' })).not.toBeInTheDocument();

    // Select John Doe as well
    fireEvent.click(screen.getByRole('checkbox', { name: /John Doe/i }));
    expect(screen.getByRole('option', { name: 'John Doe' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Alice Brown' })).not.toBeInTheDocument();
  });

  it('shows delete section only in edit mode', () => {
    const { rerender } = render(<TeamModal {...baseProps} onDelete={vi.fn()} />);

    // Add mode — no delete section
    expect(screen.queryByText('Delete Team')).not.toBeInTheDocument();

    // Edit mode — delete section appears
    rerender(<TeamModal {...baseProps} team={mockTeam} onDelete={vi.fn()} />);
    expect(screen.getByText('Delete Team')).toBeInTheDocument();

    // Click delete button — confirmation appears
    fireEvent.click(screen.getByText('Delete Team'));
    expect(screen.getByText('Confirm Delete')).toBeInTheDocument();
  });
});
