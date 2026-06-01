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
});
