import { useTheme } from '../../context/ThemeContext';
import { Modal } from '../ui/Modal';
import {
  COLOR_DANGER,
  COLOR_WARNING,
  FONT_HEADING,
} from '../../constants/config';
import { buttonStyle } from '../../styles/formStyles';
import type { Client } from '../../types';

export interface DeleteConfirmModalProps {
  open: boolean;
  client: Client | null;
  goalCount: number;
  onClose: () => void;
  onConfirm: (cascade: boolean) => void;
  theme: ReturnType<typeof useTheme>['theme'];
}

export function DeleteConfirmModal({ open, client, goalCount, onClose, onConfirm, theme }: DeleteConfirmModalProps) {
  if (!client) return null;
  return (
    <Modal open={open} onClose={onClose} title="Delete Client" theme={theme} width={440}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ fontSize: 13, color: theme.text, margin: 0 }}>
          Delete <strong style={{ fontFamily: FONT_HEADING }}>{client.name}</strong>?
          {goalCount > 0 && (
            <> This client has <strong>{goalCount}</strong> materialized goal{goalCount !== 1 ? 's' : ''}.</>
          )}
        </p>
        {goalCount > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              onClick={() => onConfirm(true)}
              style={{
                ...buttonStyle(COLOR_DANGER),
                textAlign: 'left',
                padding: '10px 14px',
              }}
            >
              <span style={{ display: 'block', fontWeight: 700, marginBottom: 2 }}>Delete with goals</span>
              <span style={{ fontSize: 11, opacity: 0.85, fontWeight: 400 }}>
                Permanently removes the client and all {goalCount} associated goal{goalCount !== 1 ? 's' : ''}.
              </span>
            </button>
            <button
              onClick={() => onConfirm(false)}
              style={{
                ...buttonStyle(COLOR_WARNING),
                textAlign: 'left',
                padding: '10px 14px',
                color: '#fff',
              }}
            >
              <span style={{ display: 'block', fontWeight: 700, marginBottom: 2 }}>Keep goals as standalone</span>
              <span style={{ fontSize: 11, opacity: 0.85, fontWeight: 400 }}>
                Removes the client but keeps goals (unlinked from any client or template).
              </span>
            </button>
          </div>
        )}
        {goalCount === 0 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button
              onClick={onClose}
              style={{ ...buttonStyle(theme.bgMuted as string), color: theme.textSecondary, background: theme.bgMuted }}
            >
              Cancel
            </button>
            <button onClick={() => onConfirm(true)} style={buttonStyle(COLOR_DANGER)}>
              Delete
            </button>
          </div>
        )}
        {goalCount > 0 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={onClose}
              style={{ ...buttonStyle(theme.bgMuted as string), color: theme.textSecondary, background: theme.bgMuted }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
