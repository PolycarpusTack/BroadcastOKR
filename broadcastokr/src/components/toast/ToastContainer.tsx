import { useToast } from '../../context/ToastContext';
import { COLOR_SUCCESS } from '../../constants/config';

export function ToastContainer() {
  const { toasts } = useToast();

  return (
    <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 2000, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
      {toasts.map((t) => (
        <div
          key={t.id}
          className={t.exiting ? 'toast-exit' : 'toast-enter'}
          style={{
            background: t.bg || COLOR_SUCCESS,
            color: '#fff',
            padding: '10px 16px',
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 12px 32px rgba(0,0,0,.4)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            pointerEvents: 'auto',
            maxWidth: 360,
          }}
        >
          <span style={{ fontSize: 16 }}>{t.icon || '\u2705'}</span>
          {t.text}
        </div>
      ))}
    </div>
  );
}
