import { useState } from 'react';
import type { StepProps } from '../wizardTypes';
import { FONT_BODY, COLOR_SUCCESS, COLOR_WARNING, PRIMARY_COLOR } from '../../../constants/config';

export function StepBridge({ theme, bridge }: StepProps) {
  const [starting, setStarting] = useState(false);
  const [message, setMessage] = useState('');

  const p = { fontSize: 13, fontFamily: FONT_BODY, color: theme.textSecondary, lineHeight: 1.6, margin: '0 0 12px 0' };

  const start = async () => {
    if (!bridge.startBridge) return;
    setStarting(true);
    setMessage('');
    try {
      setMessage((await bridge.startBridge()).message);
    } catch (e) {
      setMessage((e as Error).message || 'Could not start the bridge');
    } finally {
      setStarting(false);
    }
  };

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
        borderRadius: 8, marginBottom: 14,
        background: bridge.connected ? `${COLOR_SUCCESS}12` : `${COLOR_WARNING}12`,
        border: `1px solid ${bridge.connected ? COLOR_SUCCESS : COLOR_WARNING}44`,
      }}>
        <span style={{
          width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
          background: bridge.connected ? COLOR_SUCCESS : COLOR_WARNING,
        }} />
        <span style={{ fontSize: 13, fontWeight: 700, fontFamily: FONT_BODY, color: theme.text }}>
          {bridge.connected ? 'Bridge connected' : 'Bridge not reachable'}
        </span>
      </div>

      {bridge.connected ? (
        <p style={p}>
          Good — the app can reach its data helper. Everything from here on needs it, including
          testing a database connection and syncing live numbers.
        </p>
      ) : (
        <>
          <p style={p}>
            The bridge is the small service that talks to your database and stores shared data.
            Without it you can still plan goals and tasks, but no live numbers arrive.
          </p>
          {bridge.startBridge ? (
            <>
              <p style={p}>You are running the desktop app, so it can start its own bridge:</p>
              <button
                type="button"
                onClick={start}
                disabled={starting}
                style={{
                  padding: '8px 16px', borderRadius: 6, border: 'none', background: PRIMARY_COLOR,
                  color: '#fff', fontSize: 13, fontWeight: 600, fontFamily: FONT_BODY,
                  cursor: starting ? 'not-allowed' : 'pointer', opacity: starting ? 0.6 : 1,
                }}
              >
                {starting ? 'Starting…' : 'Start bridge service'}
              </button>
            </>
          ) : (
            <p style={p}>
              In the browser the bridge runs on a shared machine. Ask whoever set it up for the
              address, or check that the service is running — then reopen this wizard.
            </p>
          )}
          {message && (
            <p style={{ ...p, marginTop: 10, color: theme.textFaint, fontSize: 12 }}>{message}</p>
          )}
        </>
      )}

      <p style={{ ...p, marginTop: 16, fontSize: 12, color: theme.textFaint }}>
        Worth knowing: a <b>bridge</b> connection and a <b>database</b> connection are different
        things. The dot in the header only ever tells you about the first one.
      </p>
    </div>
  );
}
