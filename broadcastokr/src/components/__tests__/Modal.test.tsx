import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from '../ui/Modal';
import type { Theme } from '../../types';

const theme: Theme = {
  bg: '#fff', bgCard: '#fff', bgCardHover: '#f5f5f5', bgSidebar: '#f5f5f5',
  bgSidebarActive: '#eee', bgInput: '#fff', bgMuted: '#f5f5f5', border: '#ddd',
  borderLight: '#eee', borderInput: '#ccc', text: '#000', textSecondary: '#666',
  textMuted: '#999', textFaint: '#bbb', sidebarText: '#333', sidebarTextActive: '#000',
  overlay: 'rgba(0,0,0,0.5)', headerBg: '#fff', compliantBg: '#e6ffed',
  compliantBorder: '#10b981', atRiskBg: '#fff3cd', atRiskBorder: '#f59e0b',
};

describe('Modal', () => {
  it('renders nothing when closed', () => {
    render(
      <Modal open={false} onClose={() => {}} title="Test" theme={theme}>
        <p>Content</p>
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders dialog when open', () => {
    render(
      <Modal open onClose={() => {}} title="My Modal" theme={theme}>
        <p>Modal content</p>
      </Modal>,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('My Modal')).toBeInTheDocument();
    expect(screen.getByText('Modal content')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Test" theme={theme}>
        <p>Content</p>
      </Modal>,
    );
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when overlay is clicked', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Test" theme={theme}>
        <p>Content</p>
      </Modal>,
    );
    // Click the overlay (the outer div)
    const dialog = screen.getByRole('dialog');
    fireEvent.click(dialog.parentElement!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose on Escape key', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Test" theme={theme}>
        <p>Content</p>
      </Modal>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('has aria-modal and aria-label', () => {
    render(
      <Modal open onClose={() => {}} title="Accessible Modal" theme={theme}>
        <p>Content</p>
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-label', 'Accessible Modal');
  });
});
