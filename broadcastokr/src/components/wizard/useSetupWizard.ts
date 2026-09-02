import { useCallback, useState } from 'react';
import { logger } from '../../utils/logger';

const STORAGE_KEY = 'brokr.setupWizard.v1';

interface WizardMemory {
  completedAt?: string;
  dismissedAt?: string;
}

function read(): WizardMemory {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as WizardMemory) : {};
  } catch {
    // A private window or cleared storage must not stop the app booting.
    return {};
  }
}

function write(memory: WizardMemory): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
  } catch (err) {
    // Quota or blocked storage: the wizard simply offers itself again later.
    logger.warn('Could not persist setup-wizard state', { error: String(err) });
  }
}

export interface UseSetupWizardOptions {
  /** Number of database connections already configured. */
  connectionCount: number;
  /** False while we do not yet know (bridge unreachable, request in flight). */
  connectionCountKnown: boolean;
}

/**
 * Owns "should the wizard appear?" and the memory of having been through it.
 *
 * Auto-open is deliberately conservative: it fires only when we positively know
 * there are no database connections AND the user has neither finished nor
 * dismissed the wizard before. Guessing wrong in the other direction — popping
 * a wizard over a configured install — is far more annoying than not popping it.
 */
export function useSetupWizard({ connectionCount, connectionCountKnown }: UseSetupWizardOptions) {
  const [manuallyOpened, setManuallyOpened] = useState(false);
  const [closed, setClosed] = useState(false);
  const [memory, setMemory] = useState<WizardMemory>(read);

  const seenBefore = !!(memory.completedAt || memory.dismissedAt);

  // Derived rather than an effect: openness is a pure function of what we know,
  // so there is no render-then-correct flash and no setState-in-effect.
  const autoEligible = !seenBefore && connectionCountKnown && connectionCount === 0;
  const open = manuallyOpened || (autoEligible && !closed);

  /** Explicit launch (Help menu) always works, even after completion. */
  const openWizard = useCallback(() => {
    setClosed(false);
    setManuallyOpened(true);
  }, []);

  const dismiss = useCallback(() => {
    setManuallyOpened(false);
    setClosed(true);
    // Only remember the dismissal if this was the first pass; re-opening from
    // Help and closing again should not change anything.
    setMemory((prev) => {
      if (prev.completedAt || prev.dismissedAt) return prev;
      const next = { ...prev, dismissedAt: new Date().toISOString() };
      write(next);
      return next;
    });
  }, []);

  const complete = useCallback(() => {
    setManuallyOpened(false);
    setClosed(true);
    setMemory((prev) => {
      const next = { ...prev, completedAt: new Date().toISOString() };
      write(next);
      return next;
    });
  }, []);

  return { open, openWizard, dismiss, complete, seenBefore };
}
