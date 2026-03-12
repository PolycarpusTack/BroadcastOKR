import { useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useActivityLog } from '../context/ActivityLogContext';
import { useStore } from '../store/store';
import { CHANNELS, USERS } from '../constants';
import { safeUser } from '../utils/safeGet';
import { ProgressBar } from '../components/ui/ProgressBar';
import { ChannelBadge } from '../components/ui/ChannelBadge';
import { Avatar } from '../components/ui/Avatar';
import { Modal } from '../components/ui/Modal';
import { progressColor, statusIcon } from '../utils/colors';
import { nextGoalId } from '../utils/ids';
import type { Goal } from '../types';

export function GoalsPage() {
  const { theme } = useTheme();
  const { currentUser, permissions } = useAuth();
  const { toast } = useToast();
  const { logAction } = useActivityLog();
  const goals = useStore((s) => s.goals);
  const addGoal = useStore((s) => s.addGoal);
  const checkIn = useStore((s) => s.checkIn);

  const [filterChannel, setFilterChannel] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newChannel, setNewChannel] = useState(0);
  const [newOwner, setNewOwner] = useState(currentUser.id);
  const [newPeriod, setNewPeriod] = useState('Q1 2026');
  const [newKRs, setNewKRs] = useState([{ title: '', start: 0, target: 100 }]);

  const filtered = goals.filter((g) => {
    if (filterChannel !== 'all' && g.channel !== Number(filterChannel)) return false;
    if (filterStatus !== 'all' && g.status !== filterStatus) return false;
    return true;
  });

  const selectStyle = {
    padding: '6px 10px',
    borderRadius: 8,
    border: `1px solid ${theme.borderInput}`,
    background: theme.bgInput,
    color: theme.text,
    fontSize: 12,
    outline: 'none',
  };

  const handleCreate = () => {
    if (!newTitle.trim()) return;
    const krs = newKRs.filter((kr) => kr.title.trim());
    if (krs.length === 0) return;
    const goal: Goal = {
      id: nextGoalId(),
      title: newTitle.trim(),
      status: 'behind',
      progress: 0,
      owner: newOwner,
      channel: newChannel,
      period: newPeriod,
      keyResults: krs.map((kr) => ({
        title: kr.title.trim(),
        start: kr.start,
        target: kr.target,
        current: kr.start,
        progress: 0,
        status: 'behind' as const,
      })),
    };
    addGoal(goal);
    toast(`Goal created: ${goal.title}`, '#4f46e5', '\u{1F3AF}');
    logAction(`Created goal: ${goal.title}`, currentUser.name, '#4f46e5');
    setCreateOpen(false);
    setNewTitle('');
    setNewKRs([{ title: '', start: 0, target: 100 }]);
  };

  const handleCheckIn = (goalIndex: number, krIndex: number, goalTitle: string) => {
    checkIn(goalIndex, krIndex);
    toast('Check-in recorded!', '#10b981', '\u{1F4CB}');
    logAction(`Check-in on "${goalTitle}" KR #${krIndex + 1}`, currentUser.name, '#10b981');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Filters + Create */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <select value={filterChannel} onChange={(e) => setFilterChannel(e.target.value)} style={selectStyle}>
          <option value="all">All Channels</option>
          {CHANNELS.map((ch, i) => (
            <option key={i} value={String(i)}>{ch.icon} {ch.name}</option>
          ))}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={selectStyle}>
          <option value="all">All Statuses</option>
          <option value="on_track">On Track</option>
          <option value="at_risk">At Risk</option>
          <option value="behind">Behind</option>
        </select>
        <div style={{ flex: 1 }} />
        {permissions.canCreate && (
          <button
            onClick={() => setCreateOpen(true)}
            style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#4f46e5', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
          >
            + New Goal
          </button>
        )}
      </div>

      {/* Goal Cards */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: theme.textFaint, fontSize: 14 }}>No goals match your filters</div>
      ) : (
        filtered.map((goal) => {
          const goalIndex = goals.findIndex((g) => g.id === goal.id);
          const isExpanded = expanded === goal.id;
          const owner = safeUser(USERS, goal.owner);

          return (
            <div
              key={goal.id}
              style={{
                background: theme.bgCard,
                border: `1px solid ${theme.border}`,
                borderRadius: 14,
                overflow: 'hidden',
              }}
            >
              {/* Goal Header */}
              <div
                onClick={() => setExpanded(isExpanded ? null : goal.id)}
                style={{ padding: '16px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}
              >
                <span style={{ fontSize: 18 }}>{statusIcon(goal.status)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: theme.text }}>{goal.title}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <ChannelBadge channel={CHANNELS[goal.channel]} />
                    <span style={{ fontSize: 11, color: theme.textFaint }}>{goal.period}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Avatar user={owner} size={18} />
                      <span style={{ fontSize: 11, color: theme.textMuted }}>{owner.name}</span>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                  <div style={{ width: 100 }}><ProgressBar value={goal.progress} theme={theme} /></div>
                  <span style={{ fontSize: 14, fontWeight: 800, color: progressColor(goal.progress), minWidth: 40, textAlign: 'right' }}>
                    {Math.round(goal.progress * 100)}%
                  </span>
                  <span style={{ fontSize: 16, transition: 'transform .2s', transform: isExpanded ? 'rotate(180deg)' : 'none' }}>{'\u25BC'}</span>
                </div>
              </div>

              {/* Expanded Key Results */}
              {isExpanded && (
                <div style={{ padding: '0 20px 16px', borderTop: `1px solid ${theme.borderLight}` }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, marginTop: 14, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                    Key Results ({goal.keyResults.length})
                  </div>
                  {goal.keyResults.map((kr, ki) => (
                    <div key={ki} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, background: theme.bgMuted, border: `1px solid ${theme.borderLight}`, marginBottom: 8 }}>
                      <span style={{ fontSize: 14 }}>{statusIcon(kr.status)}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>{kr.title}</div>
                        <div style={{ fontSize: 11, color: theme.textFaint, marginTop: 2 }}>
                          {kr.current} / {kr.target} (from {kr.start})
                        </div>
                      </div>
                      <div style={{ width: 80 }}><ProgressBar value={kr.progress} height={5} theme={theme} /></div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: progressColor(kr.progress), minWidth: 36, textAlign: 'right' }}>
                        {Math.round(kr.progress * 100)}%
                      </span>
                      {permissions.canCheckIn && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleCheckIn(goalIndex, ki, goal.title); }}
                          style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#10b981', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                        >
                          Check In
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}

      {/* Create Goal Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title={'\u{1F3AF} New Goal'} theme={theme} width={540}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: theme.textMuted, display: 'block', marginBottom: 4 }}>Title</label>
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. Achieve 99.95% playout uptime"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${theme.borderInput}`, background: theme.bgInput, color: theme.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: theme.textMuted, display: 'block', marginBottom: 4 }}>Channel</label>
              <select value={newChannel} onChange={(e) => setNewChannel(Number(e.target.value))} style={{ ...selectStyle, width: '100%', padding: '10px 12px' }}>
                {CHANNELS.map((ch, i) => (
                  <option key={i} value={i}>{ch.icon} {ch.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: theme.textMuted, display: 'block', marginBottom: 4 }}>Owner</label>
              <select value={newOwner} onChange={(e) => setNewOwner(Number(e.target.value))} style={{ ...selectStyle, width: '100%', padding: '10px 12px' }}>
                {USERS.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: theme.textMuted, display: 'block', marginBottom: 4 }}>Period</label>
              <select value={newPeriod} onChange={(e) => setNewPeriod(e.target.value)} style={{ ...selectStyle, width: '100%', padding: '10px 12px' }}>
                {['Q1 2026', 'Q2 2026', 'Q3 2026', 'Q4 2026', 'Annual 2026'].map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Key Results */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: theme.textMuted }}>Key Results</label>
              <button
                onClick={() => setNewKRs([...newKRs, { title: '', start: 0, target: 100 }])}
                style={{ padding: '2px 8px', borderRadius: 4, border: `1px solid ${theme.border}`, background: 'transparent', color: theme.text, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
              >
                + Add KR
              </button>
            </div>
            {newKRs.map((kr, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                <input
                  value={kr.title}
                  onChange={(e) => { const u = [...newKRs]; u[i] = { ...u[i], title: e.target.value }; setNewKRs(u); }}
                  placeholder={`Key Result ${i + 1}`}
                  style={{ flex: 1, padding: '8px 10px', borderRadius: 6, border: `1px solid ${theme.borderInput}`, background: theme.bgInput, color: theme.text, fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
                />
                <input
                  type="number"
                  value={kr.start}
                  onChange={(e) => { const u = [...newKRs]; u[i] = { ...u[i], start: Number(e.target.value) }; setNewKRs(u); }}
                  placeholder="Start"
                  style={{ width: 60, padding: '8px 6px', borderRadius: 6, border: `1px solid ${theme.borderInput}`, background: theme.bgInput, color: theme.text, fontSize: 12, outline: 'none', textAlign: 'center', boxSizing: 'border-box' }}
                />
                <input
                  type="number"
                  value={kr.target}
                  onChange={(e) => { const u = [...newKRs]; u[i] = { ...u[i], target: Number(e.target.value) }; setNewKRs(u); }}
                  placeholder="Target"
                  style={{ width: 60, padding: '8px 6px', borderRadius: 6, border: `1px solid ${theme.borderInput}`, background: theme.bgInput, color: theme.text, fontSize: 12, outline: 'none', textAlign: 'center', boxSizing: 'border-box' }}
                />
                {newKRs.length > 1 && (
                  <button
                    onClick={() => setNewKRs(newKRs.filter((_, j) => j !== i))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textFaint, fontSize: 14, padding: 2 }}
                  >
                    {'\u2715'}
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={handleCreate}
            style={{ padding: '10px 16px', borderRadius: 8, border: 'none', background: '#4f46e5', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginTop: 6 }}
          >
            Create Goal
          </button>
        </div>
      </Modal>
    </div>
  );
}
