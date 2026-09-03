import { useEffect, useRef, useId } from 'react';
import type { ReactNode } from 'react';
import type { Theme } from '../../types';
import { FONT_HEADING } from '../../constants/config';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: number;
  theme: Theme;
}

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function Modal({ open, onClose, title, children, width = 560, theme }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Callers pass inline arrows, so onClose is a new function on every render.
  // Read it through a ref: the focus/keydown effect below must depend on `open`
  // only — keyed on onClose it re-ran on every keystroke of a controlled form
  // and moved focus to the first focusable element, the Close button (R1 rig,
  // finding 31: "every letter typed jumps to the X").
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    const prev = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => {
      // Land on the first control in the body (the form's first field); the
      // Close button in the header is the fallback for content without one.
      const first = bodyRef.current?.querySelector<HTMLElement>(FOCUSABLE)
        ?? dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      first?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
      prev?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: theme.overlay,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: theme.bgCard,
          borderRadius: 10,
          width: '100%',
          maxWidth: width,
          maxHeight: '85vh',
          overflow: 'auto',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
          border: `1px solid ${theme.border}`,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 24px 12px',
            borderBottom: `1px solid ${theme.borderLight}`,
          }}
        >
          <h3 id={titleId} style={{ fontFamily: FONT_HEADING, fontSize: 18, fontWeight: 600, color: theme.text, margin: 0 }}>{title}</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: theme.textFaint, padding: 4 }}
          >
            {'✕'}
          </button>
        </div>
        <div ref={bodyRef} style={{ padding: '16px 24px 24px' }}>{children}</div>
      </div>
    </div>
  );
}
