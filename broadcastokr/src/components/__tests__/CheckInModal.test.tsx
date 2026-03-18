import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CheckInModal } from '../goals/CheckInModal';
import type { Theme } from '../../types';

const theme: Theme = {
  bg: '#fff', bgCard: '#fff', bgCardHover: '#f5f5f5', bgSidebar: '#f5f5f5',
  bgSidebarActive: '#eee', bgInput: '#fff', bgMuted: '#f5f5f5', border: '#ddd',
  borderLight: '#eee', borderInput: '#ccc', text: '#000', textSecondary: '#666',
  textMuted: '#999', textFaint: '#bbb', sidebarText: '#333', sidebarTextActive: '#000',
  overlay: 'rgba(0,0,0,0.5)', headerBg: '#fff', compliantBg: '#e6ffed',
  compliantBorder: '#10b981', atRiskBg: '#fff3cd', atRiskBorder: '#f59e0b',
};

const baseProps = {
  open: true,
  onClose: vi.fn(),
  onSubmit: vi.fn(),
  krTitle: 'Test KR',
  currentValue: 42,
  krStatus: 'on_track' as const,
  isLive: false,
  theme,
};

describe('CheckInModal', () => {
  it('renders with pre-filled value', () => {
    render(<CheckInModal {...baseProps} />);
    const input = screen.getByLabelText('Value') as HTMLInputElement;
    expect(input.value).toBe('42');
  });

  it('pre-selects confidence from kr status (at_risk)', () => {
    render(<CheckInModal {...baseProps} krStatus="at_risk" />);
    expect(screen.getByText('At Risk')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('On Track')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Blocked')).toHaveAttribute('aria-pressed', 'false');
  });

  it('value field is read-only for live KRs', () => {
    render(<CheckInModal {...baseProps} isLive />);
    const input = screen.getByLabelText('Value') as HTMLInputElement;
    expect(input).toHaveAttribute('readOnly');
  });

  it('calls onSubmit with value, confidence, and note', () => {
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    render(<CheckInModal {...baseProps} onSubmit={onSubmit} onClose={onClose} />);

    // Change value
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: '75' } });

    // Select At Risk
    fireEvent.click(screen.getByText('At Risk'));

    // Enter a note
    fireEvent.change(screen.getByPlaceholderText("What's driving this? (optional)"), {
      target: { value: 'Making progress' },
    });

    // Submit
    fireEvent.click(screen.getByText('Record Check-in'));

    expect(onSubmit).toHaveBeenCalledWith({
      value: 75,
      confidence: 'at_risk',
      note: 'Making progress',
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('truncates note to 500 chars', () => {
    const onSubmit = vi.fn();
    const longNote = 'a'.repeat(600);
    render(<CheckInModal {...baseProps} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByPlaceholderText("What's driving this? (optional)"), {
      target: { value: longNote },
    });

    fireEvent.click(screen.getByText('Record Check-in'));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ note: 'a'.repeat(500) }),
    );
  });

  it("maps 'behind' status to Blocked confidence", () => {
    render(<CheckInModal {...baseProps} krStatus="behind" />);
    expect(screen.getByText('Blocked')).toHaveAttribute('aria-pressed', 'true');
  });

  it("maps 'done' status to On Track confidence", () => {
    render(<CheckInModal {...baseProps} krStatus="done" />);
    expect(screen.getByText('On Track')).toHaveAttribute('aria-pressed', 'true');
  });

  it('submits on Enter key', () => {
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    render(<CheckInModal {...baseProps} onSubmit={onSubmit} onClose={onClose} />);

    fireEvent.keyDown(screen.getByLabelText('Value'), { key: 'Enter' });

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ value: 42 }),
    );
    expect(onClose).toHaveBeenCalled();
  });
});
