import { useEffect, useState } from 'react';
import type { StepProps } from '../wizardTypes';
import type { DBConnection } from '../../../hooks/useBridge';
import type { Goal, KeyResult, LiveKRConfig } from '../../../types';
import { useStore } from '../../../store/store';
import { useAuth } from '../../../context/AuthContext';
import { LiveKRConfigPanel } from '../../goals/LiveKRConfigPanel';
import { buildLiveKRQueries, mapResultsToKrIds } from '../../../utils/liveSync';
import { nextGoalId } from '../../../utils/ids';
import { inputStyle, labelStyle } from '../../../styles/formStyles';
import { selectStyle as makeSelectStyle } from '../../../utils/styles';
import { FONT_BODY, COLOR_SUCCESS, COLOR_DANGER, PRIMARY_COLOR } from '../../../constants/config';
import { currentPeriod } from '../../../utils/periods';

export function StepGoal({ data, patch, theme, bridge }: StepProps) {
  const addGoal = useStore((s) => s.addGoal);
  const syncLiveKRBatch = useStore((s) => s.syncLiveKRBatch);
  const { currentUser } = useAuth();

  const [title, setTitle] = useState('');
  const [krTitle, setKrTitle] = useState('');
  const [start, setStart] = useState(0);
  const [target, setTarget] = useState(100);
  const [connections, setConnections] = useState<DBConnection[]>([]);
  const [config, setConfig] = useState<LiveKRConfig>({
    connectionId: data.connectionId ?? '', sql: '', unit: 'count', direction: 'hi',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    bridge.getConnections().then(setConnections).catch(() => setConnections([]));
  }, [bridge]);

  const p = { fontSize: 13, fontFamily: FONT_BODY, color: theme.textSecondary, lineHeight: 1.6, margin: '0 0 12px 0' };
  const created = !!data.goalId;
  const ready = title.trim() && krTitle.trim() && config.connectionId && config.sql.trim();

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      const kr: KeyResult = {
        id: crypto.randomUUID(),
        title: krTitle.trim(),
        start, target,
        current: start,
        progress: 0,
        status: 'behind',
        liveConfig: config,
        syncStatus: 'pending',
      };
      const goal: Goal = {
        id: nextGoalId(),
        title: title.trim(),
        status: 'behind',
        progress: 0,
        owner: currentUser.id,
        channel: 0,
        period: currentPeriod(),
        keyResults: [kr],
        ...(data.clientId ? { clientIds: [data.clientId], channelScope: { type: 'all' as const } } : {}),
      };
      addGoal(goal);

      // Run it immediately — the point of the whole wizard is seeing a real
      // number, and a goal that sits at "pending" proves nothing.
      const queries = buildLiveKRQueries([goal]);
      const { results } = await bridge.executeBatch(queries);
      syncLiveKRBatch(mapResultsToKrIds(results, queries));

      const first = results[0];
      if (first?.status === 'ok') {
        patch({ goalId: goal.id, goalTitle: goal.title, krValue: first.current });
      } else {
        patch({ goalId: goal.id, goalTitle: goal.title });
        setError(first?.error || 'The goal was created, but its query did not return a value.');
      }
    } catch (e) {
      setError((e as Error).message || 'Could not create the goal');
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <div>
        <div style={{
          padding: '14px', borderRadius: 8, marginBottom: 14,
          background: data.krValue !== undefined ? `${COLOR_SUCCESS}12` : `${COLOR_DANGER}10`,
          border: `1px solid ${data.krValue !== undefined ? COLOR_SUCCESS : COLOR_DANGER}44`,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, fontFamily: FONT_BODY, color: theme.text }}>
            ✓ “{data.goalTitle}” created
          </div>
          {data.krValue !== undefined && (
            <div style={{ marginTop: 8, fontSize: 26, fontWeight: 700, color: COLOR_SUCCESS, fontFamily: FONT_BODY }}>
              {data.krValue.toLocaleString()} <span style={{ fontSize: 13, color: theme.textSecondary }}>{config.unit}</span>
            </div>
          )}
        </div>
        {data.krValue !== undefined ? (
          <p style={p}>
            That number came out of your database just now. From here the bridge re-runs the query
            every 15 minutes on its own — no browser needs to be open.
          </p>
        ) : (
          <p style={{ ...p, color: COLOR_DANGER }}>{error}</p>
        )}
        <p style={{ ...p, fontSize: 12, color: theme.textFaint }}>
          Turn on <b>monitoring</b> for this goal on the Goals page and every sync also writes a
          history point — that is what fills in the trend line over a quarter.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p style={p}>
        A goal holds Key Results. Make one of them <b>live</b> and its value comes from a query
        instead of a person typing it in.
      </p>

      <div style={{ marginBottom: 10 }}>
        <label style={{ ...labelStyle(theme), fontSize: 11 }} htmlFor="wizard-goal-title">Goal title</label>
        <input
          id="wizard-goal-title"
          style={{ ...inputStyle(theme), fontSize: 12 }}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Subtitle readiness for Q4"
        />
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={{ ...labelStyle(theme), fontSize: 11 }} htmlFor="wizard-kr-title">Key Result</label>
        <input
          id="wizard-kr-title"
          style={{ ...inputStyle(theme), fontSize: 12 }}
          value={krTitle}
          onChange={(e) => setKrTitle(e.target.value)}
          placeholder="e.g. 90% of scheduled assets have approved Dutch subtitles"
        />
      </div>

      <LiveKRConfigPanel
        config={config}
        target={target}
        start={start}
        onUpdateConfig={(p2) => setConfig((prev) => ({ ...prev, ...p2 }))}
        onUpdateKR={(p2) => {
          if (p2.target !== undefined) setTarget(p2.target);
          if (p2.start !== undefined) setStart(p2.start);
        }}
        connections={connections}
        getTables={bridge.getTables}
        getColumns={bridge.getColumns}
        previewQuery={bridge.previewQuery}
        theme={theme}
        selectStyle={makeSelectStyle(theme)}
        inputStyle={inputStyle(theme)}
        labelStyle={labelStyle(theme)}
      />

      <p style={{ ...p, marginTop: 12, fontSize: 12, color: theme.textFaint }}>
        Set <b>Start</b> to where you are today, not zero — progress is measured from start to
        target, so a start of 0 on a percentage flatters the number badly.
      </p>

      <button
        type="button"
        onClick={create}
        disabled={busy || !ready}
        style={{
          marginTop: 6, padding: '8px 16px', borderRadius: 6, border: 'none', background: PRIMARY_COLOR,
          color: '#fff', fontSize: 13, fontWeight: 600, fontFamily: FONT_BODY,
          cursor: busy || !ready ? 'not-allowed' : 'pointer', opacity: busy || !ready ? 0.5 : 1,
        }}
      >
        {busy ? 'Creating and syncing…' : 'Create goal and fetch the number'}
      </button>

      {error && <p style={{ ...p, marginTop: 12, color: COLOR_DANGER, fontSize: 12 }}>{error}</p>}
    </div>
  );
}
