import { useState } from 'react';
import type { StepProps } from '../wizardTypes';
import { useStore } from '../../../store/store';
import { inputStyle, labelStyle } from '../../../styles/formStyles';
import { FONT_BODY, COLOR_SUCCESS, COLOR_DANGER, PRIMARY_COLOR } from '../../../constants/config';

const PRESET_COLORS = ['#3805E3', '#2DD4BF', '#F59E0B', '#F87171', '#6366F1', '#EC4899'];

export function StepClient({ data, patch, theme, bridge }: StepProps) {
  const addClient = useStore((s) => s.addClient);
  const [name, setName] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [channelCount, setChannelCount] = useState<number | null>(null);

  const p = { fontSize: 13, fontFamily: FONT_BODY, color: theme.textSecondary, lineHeight: 1.6, margin: '0 0 12px 0' };
  const created = !!data.clientId;

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setError('');

    // Channels are reference data, not a precondition: a client is still valid
    // if the lookup finds nothing (not every install exposes PSICHANNEL).
    let channels: Array<{ id: string; name: string; color?: string }> = [];
    if (data.connectionId) {
      try {
        const found = await bridge.getChannels(data.connectionId);
        channels = found.map((c) => ({ id: c.id, name: c.name, color }));
        setChannelCount(found.length);
      } catch {
        setChannelCount(0);
      }
    }

    try {
      const id = crypto.randomUUID();
      addClient({
        id,
        name: trimmed,
        connectionId: data.connectionId ?? '',
        color,
        channels,
      });
      patch({ clientId: id });
    } catch (e) {
      setError((e as Error).message || 'Could not create the client');
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <div>
        <div style={{
          padding: '12px 14px', borderRadius: 8, marginBottom: 14,
          background: `${COLOR_SUCCESS}12`, border: `1px solid ${COLOR_SUCCESS}44`,
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, fontFamily: FONT_BODY, color: theme.text }}>
            ✓ Client created
            {channelCount !== null && ` — ${channelCount} channel${channelCount === 1 ? '' : 's'} pulled`}
          </span>
        </div>
        <p style={p}>
          {channelCount === 0
            ? 'No channels came back, which is fine — that lookup expects a PSICHANNEL table and not '
              + 'every install has one. You can add channels by hand on the Clients page.'
            : 'Channels are pulled straight from the database, so the names match what schedulers see.'}
        </p>
      </div>
    );
  }

  return (
    <div>
      <p style={p}>
        A <b>client</b> is who the goals belong to — a broadcaster, a customer, a business unit.
        Goals, tasks and channels all hang off it, and it is what lets one template measure the
        same thing across several databases.
      </p>

      <div style={{ marginBottom: 10 }}>
        <label style={{ ...labelStyle(theme), fontSize: 11 }} htmlFor="wizard-client-name">Client name</label>
        <input
          id="wizard-client-name"
          style={{ ...inputStyle(theme), fontSize: 12 }}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. VRT"
        />
      </div>

      <div style={{ marginBottom: 14 }}>
        <span style={{ ...labelStyle(theme), fontSize: 11 }}>Colour</span>
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Colour ${c}`}
              onClick={() => setColor(c)}
              style={{
                width: 24, height: 24, borderRadius: '50%', background: c, cursor: 'pointer',
                border: color === c ? `2px solid ${theme.text}` : '2px solid transparent',
              }}
            />
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={create}
        disabled={busy || !name.trim()}
        style={{
          padding: '8px 16px', borderRadius: 6, border: 'none', background: PRIMARY_COLOR,
          color: '#fff', fontSize: 13, fontWeight: 600, fontFamily: FONT_BODY,
          cursor: busy || !name.trim() ? 'not-allowed' : 'pointer',
          opacity: busy || !name.trim() ? 0.5 : 1,
        }}
      >
        {busy ? 'Creating…' : data.connectionId ? 'Create client and pull channels' : 'Create client'}
      </button>

      {error && <p style={{ ...p, marginTop: 12, color: COLOR_DANGER, fontSize: 12 }}>{error}</p>}
    </div>
  );
}
