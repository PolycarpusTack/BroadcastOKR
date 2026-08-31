import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DeveloperGuideModal } from '../DeveloperGuideModal';
import { THEMES } from '../../../constants/themes';

const theme = THEMES.dark;

describe('DeveloperGuideModal', () => {
  it('renders the first chapter when open', () => {
    render(<DeveloperGuideModal open onClose={() => {}} theme={theme} />);
    expect(screen.getByText(/The Developer’s Guide/i)).toBeTruthy();
    expect(screen.getByText(/npm ci/i)).toBeTruthy();
  });

  it('switches chapters when one is clicked', () => {
    render(<DeveloperGuideModal open onClose={() => {}} theme={theme} />);
    fireEvent.click(screen.getByRole('button', { name: /Building & Packaging/i }));
    expect(screen.getByText(/npm rebuild better-sqlite3/i)).toBeTruthy();
  });

  it('renders nothing when closed', () => {
    const { container } = render(<DeveloperGuideModal open={false} onClose={() => {}} theme={theme} />);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });
});
