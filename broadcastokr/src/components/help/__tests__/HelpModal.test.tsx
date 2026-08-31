import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HelpModal } from '../HelpModal';
import { THEMES } from '../../../constants/themes';

const theme = THEMES.dark;

describe('HelpModal', () => {
  it('renders the first chapter when open', () => {
    render(<HelpModal open onClose={() => {}} theme={theme} />);
    expect(screen.getByText('Help & Getting Started', { exact: false })).toBeTruthy();
    expect(screen.getByText(/30-second version/i)).toBeTruthy();
  });

  it('switches chapters when a topic is clicked', () => {
    render(<HelpModal open onClose={() => {}} theme={theme} />);
    fireEvent.click(screen.getByRole('button', { name: /Who Can Do What/i }));
    expect(screen.getByText(/Three roles, increasing power/i)).toBeTruthy();
  });

  it('renders nothing when closed', () => {
    const { container } = render(<HelpModal open={false} onClose={() => {}} theme={theme} />);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('has a Set It Up chapter covering both install flavours', () => {
    render(<HelpModal open onClose={() => {}} theme={theme} />);
    fireEvent.click(screen.getByRole('button', { name: /Set It Up/i }));
    expect(screen.getByText(/two flavours/i)).toBeTruthy();
    expect(screen.getByText(/Start Bridge Service/i)).toBeTruthy();
  });

  it('opens the developer guide via the footer link when provided', () => {
    let opened = false;
    render(<HelpModal open onClose={() => {}} theme={theme} onOpenDevGuide={() => { opened = true; }} />);
    fireEvent.click(screen.getByRole('button', { name: /Developer Guide/i }));
    expect(opened).toBe(true);
  });

  it('hides the developer guide link when no handler is provided', () => {
    render(<HelpModal open onClose={() => {}} theme={theme} />);
    expect(screen.queryByRole('button', { name: /Developer Guide/i })).toBeNull();
  });
});
