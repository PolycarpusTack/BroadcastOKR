import React from 'react';
import { ProgressBar } from '../ui/ProgressBar';
import { ChannelBadge } from '../ui/ChannelBadge';
import { Avatar } from '../ui/Avatar';
import { PillBadge } from '../ui/PillBadge';
import { progressColor, statusIcon } from '../../utils/colors';
import { safeUser, safeChannel } from '../../utils/safeGet';
import { resolveScopedChannels } from '../../utils/channelScope';
import { COLOR_INFO, COLOR_SUCCESS, COLOR_DANGER, COLOR_WARNING, PRIMARY_COLOR } from '../../constants/config';
import type { Goal, KeyResult, Theme, User, Client, Channel, RolePermissions } from '../../types';

export interface GoalCardProps {
  goal: Goal;
  theme: Theme;
  isExpanded: boolean;
  onToggleExpand: (goalId: string | null) => void;
  users: User[];
  channels: Channel[];
  clients: Client[];
  permissions: RolePermissions;
  bridgeConnected: boolean;
  syncingGoalId: string | null;
  confirmDeleteId: string | null;
  monitorOpen: string | null;
  onEdit: (goal: Goal) => void;
  onDelete: (goalId: string, goalTitle: string) => void;
  onSetConfirmDeleteId: (id: string | null) => void;
  onCheckIn: (target: { goalId: string; krIndex: number; krId: string }) => void;
  onSyncGoal: (goalId: string, keyResults: KeyResult[]) => void;
  onSetMonitor: (type: 'goal', id: string, days: number | null) => void;
  onSetMonitorOpen: (id: string | null) => void;
}

export const GoalCard = React.memo(function GoalCard({
  goal,
  theme,
  isExpanded,
  onToggleExpand,
  users,
  channels,
  clients,
  permissions,
  bridgeConnected,
  syncingGoalId,
  confirmDeleteId,
  monitorOpen,
  onEdit,
  onDelete,
  onSetConfirmDeleteId,
  onCheckIn,
  onSyncGoal,
  onSetMonitor,
  onSetMonitorOpen,
}: GoalCardProps) {
  const owner = safeUser(users, goal.owner);
  const hasLiveKRs = goal.keyResults.some((kr) => kr.liveConfig);
  const isSyncing = syncingGoalId === goal.id;
  const isTemplateBacked = !!goal.templateId;

  // Monitoring state
  const goalMonitorActive = !!goal.monitorUntil && new Date(goal.monitorUntil) > new Date();
  const monitoringClients = (goal.clientIds ?? [])
    .map((cid) => clients.find((c) => c.id === cid))
    .filter((c): c is NonNullable<typeof c> => !!c && !!c.monitorUntil && new Date(c.monitorUntil) > new Date());
  const clientMonitorActive = !goalMonitorActive && monitoringClients.length > 0;

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const resolvedGoalScopedChannels =
    goal.channelScope?.type === 'selected'
      ? resolveScopedChannels(goal.channelScope, clients)
      : [];

  return (
    <div style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 10, overflow: 'hidden' }}>
      <div onClick={() => onToggleExpand(isExpanded ? null : goal.id)} style={{ padding: '16px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 18 }}>{statusIcon(goal.status)}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: theme.text }}>{goal.title}</span>
            {hasLiveKRs && <PillBadge label={'\u{1F4E1} Live'} color={COLOR_INFO} />}
            {isTemplateBacked && <PillBadge label={'\u{1F4CB} Template'} color={PRIMARY_COLOR} />}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
            {/* Channel display: scope-aware when channelScope present, legacy otherwise */}
            {goal.channelScope ? (
              goal.channelScope.type === 'all' ? (
                <PillBadge
                  label="All Channels"
                  color={clients.find((c) => goal.clientIds?.includes(c.id))?.color ?? PRIMARY_COLOR}
                />
              ) : (
                resolvedGoalScopedChannels.map((channel) => (
                  <PillBadge
                    key={channel.key}
                    label={channel.label}
                    color={channel.color}
                  />
                ))
              )
            ) : (
              <ChannelBadge channel={safeChannel(channels, goal.channel)} />
            )}
            {/* Client pills */}
            {goal.clientIds && goal.clientIds.length > 0 && (
              goal.clientIds.map((cid) => {
                const cl = clients.find((c) => c.id === cid);
                if (!cl) return null;
                return (
                  <span
                    key={cid}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '1px 6px',
                      borderRadius: 10,
                      background: cl.color + '22',
                      border: `1px solid ${cl.color}55`,
                      fontSize: 10,
                      color: theme.text,
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: cl.color, flexShrink: 0 }} />
                    {cl.name}
                  </span>
                );
              })
            )}
            <span style={{ fontSize: 11, color: theme.textFaint }}>{goal.period}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Avatar user={owner} size={18} />
              <span style={{ fontSize: 11, color: theme.textMuted }}>{owner.name}</span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          {permissions.canEdit && (
            <button onClick={(e) => { e.stopPropagation(); onEdit(goal); }} aria-label="Edit goal" style={{ background: 'none', border: `1px solid ${theme.border}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer', color: theme.textSecondary, fontSize: 11, fontWeight: 600 }}>
              {'\u270E'}
            </button>
          )}
          <div style={{ width: 100 }}><ProgressBar value={goal.progress} theme={theme} /></div>
          <span style={{ fontSize: 14, fontWeight: 800, color: progressColor(goal.progress), minWidth: 40, textAlign: 'right' }}>{Math.round(goal.progress * 100)}%</span>
          <span
            aria-label={isExpanded ? 'Collapse key results' : 'Expand key results'}
            aria-expanded={isExpanded}
            style={{ fontSize: 16, transition: 'transform .2s', transform: isExpanded ? 'rotate(180deg)' : 'none' }}
          >{'\u25BC'}</span>
        </div>
      </div>

      {isExpanded && (
        <div style={{ padding: '0 20px 16px', borderTop: `1px solid ${theme.borderLight}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '.05em' }}>
              Key Results ({goal.keyResults.length})
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {hasLiveKRs && bridgeConnected && (
                <button
                  onClick={(e) => { e.stopPropagation(); onSyncGoal(goal.id, goal.keyResults); }}
                  disabled={isSyncing}
                  style={{
                    padding: '3px 10px', borderRadius: 4, border: 'none',
                    background: COLOR_INFO, color: '#fff', fontSize: 10, fontWeight: 700,
                    cursor: isSyncing ? 'not-allowed' : 'pointer', opacity: isSyncing ? 0.6 : 1,
                  }}
                >
                  {isSyncing ? '\u{1F504} Syncing...' : '\u{1F4E1} Sync Live KRs'}
                </button>
              )}
              {permissions.canCheckIn && (
                goalMonitorActive ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <PillBadge
                      label={`Monitoring until ${fmtDate(goal.monitorUntil!)}`}
                      color={COLOR_WARNING}
                    />
                    <button
                      onClick={(e) => { e.stopPropagation(); onSetMonitor('goal', goal.id, null); }}
                      style={{
                        padding: '1px 5px', borderRadius: 4, border: `1px solid ${COLOR_WARNING}`,
                        background: 'transparent', color: COLOR_WARNING, fontSize: 9,
                        fontWeight: 700, cursor: 'pointer', lineHeight: 1,
                      }}
                    >
                      ✕
                    </button>
                  </span>
                ) : clientMonitorActive ? (
                  <PillBadge
                    label={`Monitored via ${
                      monitoringClients.length === 1
                        ? monitoringClients[0].name
                        : monitoringClients.length === 2
                        ? `${monitoringClients[0].name}, ${monitoringClients[1].name}`
                        : `${monitoringClients[0].name}, ${monitoringClients[1].name} +${monitoringClients.length - 2} more`
                    }`}
                    color={COLOR_WARNING}
                  />
                ) : monitorOpen === goal.id ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} onClick={(e) => e.stopPropagation()}>
                    {[1, 3, 7, 14].map((d) => (
                      <button
                        key={d}
                        onClick={() => { onSetMonitor('goal', goal.id, d); onSetMonitorOpen(null); }}
                        style={{
                          padding: '2px 7px', borderRadius: 4, border: `1px solid ${COLOR_WARNING}`,
                          background: 'transparent', color: COLOR_WARNING, fontSize: 10,
                          fontWeight: 700, cursor: 'pointer',
                        }}
                      >
                        {d}d
                      </button>
                    ))}
                    <button
                      onClick={() => onSetMonitorOpen(null)}
                      style={{
                        padding: '2px 6px', borderRadius: 4, border: `1px solid ${theme.border}`,
                        background: 'transparent', color: theme.textMuted, fontSize: 10,
                        fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); onSetMonitorOpen(goal.id); }}
                    style={{
                      padding: '2px 8px', borderRadius: 4, border: `1px solid ${theme.border}`,
                      background: 'transparent', color: theme.textMuted, fontSize: 10,
                      fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    Monitor
                  </button>
                )
              )}
            </div>
          </div>
          {goal.keyResults.map((kr, ki) => (
            <div key={ki} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, background: theme.bgMuted, border: `1px solid ${theme.borderLight}`, marginBottom: 8 }}>
              <span style={{ fontSize: 14 }}>{statusIcon(kr.status)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>{kr.title}</span>
                  {kr.liveConfig && <PillBadge label={'\u{1F4E1}'} color={COLOR_INFO} />}
                  {kr.syncStatus && kr.syncStatus !== 'ok' && kr.syncStatus !== 'pending' && (
                    <PillBadge label={kr.syncStatus} color={COLOR_DANGER} />
                  )}
                </div>
                <div style={{ fontSize: 11, color: theme.textFaint, marginTop: 2 }}>
                  {kr.current} / {kr.target} (from {kr.start})
                  {kr.liveConfig && kr.lastSyncAt && (
                    <span style={{ marginLeft: 8, fontSize: 10, color: theme.textFaint }}>
                      synced {new Date(kr.lastSyncAt).toLocaleTimeString()}
                    </span>
                  )}
                </div>
                {kr.syncError && (
                  <div style={{ fontSize: 10, color: COLOR_DANGER, marginTop: 2 }}>{kr.syncError}</div>
                )}
              </div>
              <div style={{ width: 80 }}><ProgressBar value={kr.progress} height={5} theme={theme} /></div>
              <span style={{ fontSize: 12, fontWeight: 700, color: progressColor(kr.progress), minWidth: 36, textAlign: 'right' }}>{Math.round(kr.progress * 100)}%</span>
              {permissions.canCheckIn && !kr.liveConfig && (
                <button onClick={(e) => { e.stopPropagation(); onCheckIn({ goalId: goal.id, krIndex: ki, krId: kr.id }); }} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: COLOR_SUCCESS, color: '#000', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>Check In</button>
              )}
              {permissions.canCheckIn && kr.liveConfig && (
                <button onClick={(e) => { e.stopPropagation(); onCheckIn({ goalId: goal.id, krIndex: ki, krId: kr.id }); }} style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${COLOR_SUCCESS}`, background: 'transparent', color: COLOR_SUCCESS, fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>Check In</button>
              )}
            </div>
          ))}

          {permissions.canDelete && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${theme.borderLight}` }}>
              {confirmDeleteId !== goal.id ? (
                <button onClick={() => onSetConfirmDeleteId(goal.id)} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #F871714D', background: '#F8717118', color: COLOR_DANGER, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Delete Goal</button>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: COLOR_DANGER, fontWeight: 600 }}>Delete this goal?</span>
                  <button onClick={() => onDelete(goal.id, goal.title)} style={{ padding: '4px 12px', borderRadius: 6, border: 'none', background: COLOR_DANGER, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Confirm</button>
                  <button onClick={() => onSetConfirmDeleteId(null)} style={{ padding: '4px 12px', borderRadius: 6, border: `1px solid ${theme.border}`, background: 'transparent', color: theme.text, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
