import { useEffect, useState } from 'react';
import type { StepProps } from '../wizardTypes';
import type { DBConnection } from '../../../hooks/useBridge';
import { inputStyle, labelStyle } from '../../../styles/formStyles';
import { selectStyle as makeSelectStyle } from '../../../utils/styles';
import { FONT_BODY, FONT_MONO, COLOR_SUCCESS, COLOR_DANGER, COLOR_INFO, PRIMARY_COLOR } from '../../../constants/config';

export function StepKPI({ data, patch, theme, bridge }: StepProps) {
  const [connections, setConnections] = useState<DBConnection[]>([]);
  const [connectionId, setConnectionId] = useState(data.connectionId ?? '');
  const [name, setName] = useState('');
  const [sql, setSql] = useState('');
  const [unit, setUnit] = useState('count');
  const [direction, setDirection] = useState<'hi' | 'lo'>('hi');
  const [target, setTarget] = useState('100');
  const [preview, setPreview] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    bridge.getConnections().then(setConnections).catch(() => setConnections([]));
  }, [bridge]);

  const p = { fontSize: 13, fontFamily: FONT_BODY, color: theme.textSecondary, lineHeight: 1.6, margin: '0 0 12px 0' };
  const small = { ...inputStyle(theme), fontSize: 12 };
  const smallLabel = { ...labelStyle(theme), fontSize: 11 };
  const created = !!data.kpiId;
  const ready = name.trim() && sql.trim() && connectionId && target.trim();

  const runPreview = async () => {
    setError('');
    try {
      const rows = await bridge.previewQuery(connectionId, sql);
      const first = rows[0] ? Object.values(rows[0])[0] : undefined;
      setPreview(first === undefined ? 'Query returned no rows' : String(first));
    } catch (e) {
      setError((e as Error).message || 'Preview failed');
      setPreview('');
    }
  };

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const id = `kpi_${Date.now()}`;
      await bridge.saveKPI({
        id, name: name.trim(), connectionId, sql: sql.trim(),
        unit: unit.trim() || 'count', direction, target: Number(target) || 0,
      });
      patch({ kpiId: id });
    } catch (e) {
      setError((e as Error).message || 'Could not save the KPI');
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
            ✓ KPI saved — it appears on the Dashboard
          </span>
        </div>
        <p style={p}>
          The bridge polls every KPI on a timer and keeps the last 100 readings, which is what draws
          the little trend line. Nobody checks in on it and it has no owner — that is the whole
          difference from a Key Result.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p style={p}>
        A KPI is a number on the Dashboard with a target and a trend. Same kind of query as a live
        Key Result — the difference is that nothing is committed to and nobody is asked about it.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginBottom: 10 }}>
        <div>
          <label style={smallLabel} htmlFor="wizard-kpi-name">KPI name</label>
          <input id="wizard-kpi-name" style={small} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Transmissions this month" />
        </div>
        <div>
          <label style={smallLabel} htmlFor="wizard-kpi-conn">Connection</label>
          <select
            id="wizard-kpi-conn"
            style={{ ...makeSelectStyle(theme), width: '100%', padding: '10px 12px', fontSize: 12 }}
            value={connectionId}
            onChange={(e) => setConnectionId(e.target.value)}
          >
            <option value="">Select…</option>
            {connections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div>
          <label style={smallLabel} htmlFor="wizard-kpi-unit">Unit</label>
          <input id="wizard-kpi-unit" style={small} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="tx, %, items" />
        </div>
        <div>
          <label style={smallLabel} htmlFor="wizard-kpi-direction">Direction</label>
          <select
            id="wizard-kpi-direction"
            style={{ ...makeSelectStyle(theme), width: '100%', padding: '10px 12px', fontSize: 12 }}
            value={direction}
            onChange={(e) => setDirection(e.target.value as 'hi' | 'lo')}
          >
            <option value="hi">Higher is better</option>
            <option value="lo">Lower is better</option>
          </select>
        </div>
        <div>
          <label style={smallLabel} htmlFor="wizard-kpi-target">Target</label>
          <input id="wizard-kpi-target" style={small} value={target} onChange={(e) => setTarget(e.target.value)} />
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={smallLabel} htmlFor="wizard-kpi-sql">SQL (must return a single number)</label>
        <textarea
          id="wizard-kpi-sql"
          rows={3}
          style={{ ...small, fontFamily: FONT_MONO, resize: 'vertical' }}
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          placeholder="SELECT COUNT(*) AS value FROM ..."
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <button
            type="button"
            onClick={runPreview}
            disabled={!connectionId || !sql.trim()}
            style={{
              padding: '4px 10px', borderRadius: 4, border: 'none', background: COLOR_INFO,
              color: '#fff', fontSize: 11, fontWeight: 600, fontFamily: FONT_BODY,
              cursor: !connectionId || !sql.trim() ? 'not-allowed' : 'pointer',
              opacity: !connectionId || !sql.trim() ? 0.5 : 1,
            }}
          >
            Preview
          </button>
          {preview && (
            <span style={{ fontSize: 12, fontFamily: FONT_MONO, color: theme.textSecondary }}>
              → {preview}
            </span>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={save}
        disabled={busy || !ready}
        style={{
          padding: '8px 16px', borderRadius: 6, border: 'none', background: PRIMARY_COLOR,
          color: '#fff', fontSize: 13, fontWeight: 600, fontFamily: FONT_BODY,
          cursor: busy || !ready ? 'not-allowed' : 'pointer', opacity: busy || !ready ? 0.5 : 1,
        }}
      >
        {busy ? 'Saving…' : 'Save KPI'}
      </button>

      {error && <p style={{ ...p, marginTop: 12, color: COLOR_DANGER, fontSize: 12 }}>{error}</p>}
    </div>
  );
}
