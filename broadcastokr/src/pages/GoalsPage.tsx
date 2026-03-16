import { useState, useMemo, useCallback, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useActivityLog } from '../context/ActivityLogContext';
import { useStore } from '../store/store';
import { CHANNELS, USERS } from '../constants';
import { safeUser, safeChannel } from '../utils/safeGet';
import { selectStyle as makeSelectStyle } from '../utils/styles';
import { ProgressBar } from '../components/ui/ProgressBar';
import { ChannelBadge } from '../components/ui/ChannelBadge';
import { Avatar } from '../components/ui/Avatar';
import { PillBadge } from '../components/ui/PillBadge';
import { Modal } from '../components/ui/Modal';
import { GoalFormFields } from '../components/goals/GoalFormFields';
import type { GoalFormKR } from '../components/goals/GoalFormFields';
import { TemplateCard } from '../components/templates/TemplateCard';
import { TemplateForm } from '../components/templates/TemplateForm';
import { MaterializeModal } from '../components/templates/MaterializeModal';
import { progressColor, statusIcon, goalStatus } from '../utils/colors';
import { nextGoalId } from '../utils/ids';
import { PRIMARY_COLOR, COLOR_SUCCESS, COLOR_DANGER, COLOR_INFO } from '../constants/config';
import type { Goal, KeyResult, SyncStatus, GoalTemplate } from '../types';
import type { DBConnection, TableInfo, ColumnInfo } from '../hooks/useBridge';

interface GoalsPageProps {
  /** Bridge connected? */
  bridgeConnected?: boolean;
  /** Fetch connections from bridge */
  getConnections?: () => Promise<DBConnection[]>;
  /** Get tables for a connection */
  getTables?: (connectionId: string) => Promise<TableInfo[]>;
  /** Get columns for a table */
  getColumns?: (connectionId: string, tableName: string) => Promise<ColumnInfo[]>;
  /** Preview SQL query */
  previewQuery?: (connectionId: string, sql: string) => Promise<Record<string, unknown>[]>;
  /** Fetch channels for a connection */
  getChannels?: (connectionId: string) => Promise<Array<{ id: string; name: string; internalValue?: string; channelKind?: string }>>;
  /** Execute batch of KR queries */
  executeBatch?: (queries: Array<{
    goalId: string;
    krIndex: number;
    connectionId: string;
    sql: string;
    binds?: Record<string, unknown>;
    timeframeDays?: number;
  }>) => Promise<{
    results: Array<{
      goalId: string;
      krIndex: number;
      status: 'ok' | 'error' | 'timeout' | 'no_data';
      current?: number;
      error?: string;
    }>;
  }>;
}

export function GoalsPage({
  bridgeConnected = false, getConnections,
  getTables, getColumns, previewQuery, getChannels, executeBatch,
}: GoalsPageProps) {
  const { theme } = useTheme();
  const { currentUser, permissions } = useAuth();
  const { toast } = useToast();
  const { logAction } = useActivityLog();
  const goals = useStore((s) => s.goals);
  const addGoal = useStore((s) => s.addGoal);
  const checkIn = useStore((s) => s.checkIn);
  const updateGoal = useStore((s) => s.updateGoal);
  const deleteGoal = useStore((s) => s.deleteGoal);
  const syncLiveKRBatch = useStore((s) => s.syncLiveKRBatch);

  // Template selectors
  const goalTemplates = useStore((s) => s.goalTemplates);
  const clients = useStore((s) => s.clients);
  const addGoalTemplate = useStore((s) => s.addGoalTemplate);
  const updateGoalTemplate = useStore((s) => s.updateGoalTemplate);
  const deleteGoalTemplate = useStore((s) => s.deleteGoalTemplate);
  const materializeTemplate = useStore((s) => s.materializeTemplate);
  const syncTemplateToGoals = useStore((s) => s.syncTemplateToGoals);

  const [connections, setConnections] = useState<DBConnection[]>([]);

  // Load connections when bridge is connected or when a modal opens
  const refreshConnections = useCallback(() => {
    if (bridgeConnected && getConnections) {
      getConnections().then(setConnections).catch(() => setConnections([]));
    } else {
      setConnections([]);
    }
  }, [bridgeConnected, getConnections]);

  useEffect(refreshConnections, [refreshConnections]);

  // View toggle: goals vs templates
  const [view, setView] = useState<'goals' | 'templates'>('goals');

  const [filterChannel, setFilterChannel] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterClient, setFilterClient] = useState('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [syncingGoalId, setSyncingGoalId] = useState<string | null>(null);

  // Template modal state
  const [templateFormOpen, setTemplateFormOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<GoalTemplate | undefined>(undefined);
  const [materializeTemplateId, setMaterializeTemplateId] = useState<string | null>(null);
  const [deleteTemplateId, setDeleteTemplateId] = useState<string | null>(null);
  const [deleteTemplateCascade, setDeleteTemplateCascade] = useState(false);

  // Create modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newChannel, setNewChannel] = useState(0);
  const [newOwner, setNewOwner] = useState(currentUser.id);
  const [newPeriod, setNewPeriod] = useState('Q1 2026');
  const [newKRs, setNewKRs] = useState<GoalFormKR[]>([{ title: '', start: 0, target: 100 }]);
  const [newClientIds, setNewClientIds] = useState<string[]>([]);
  const [newChannelScopeType, setNewChannelScopeType] = useState<'all' | 'selected'>('all');
  const [newSelectedChannelIds, setNewSelectedChannelIds] = useState<string[]>([]);

  // Edit modal state
  const [editGoalId, setEditGoalId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editChannel, setEditChannel] = useState(0);
  const [editOwner, setEditOwner] = useState(0);
  const [editPeriod, setEditPeriod] = useState('');
  const [editKRs, setEditKRs] = useState<GoalFormKR[]>([]);
  const [editClientIds, setEditClientIds] = useState<string[]>([]);
  const [editChannelScopeType, setEditChannelScopeType] = useState<'all' | 'selected'>('all');
  const [editSelectedChannelIds, setEditSelectedChannelIds] = useState<string[]>([]);

  // Re-fetch connections when create/edit modal opens (picks up new connections from KPIConfigModal)
  useEffect(() => {
    if (createOpen || editGoalId) refreshConnections();
  }, [createOpen, editGoalId, refreshConnections]);

  const filtered = useMemo(() => goals.filter((g) => {
    if (filterChannel !== 'all' && g.channel !== Number(filterChannel)) return false;
    if (filterStatus !== 'all' && g.status !== filterStatus) return false;
    if (filterClient !== 'all' && !(g.clientIds?.includes(filterClient))) return false;
    return true;
  }), [goals, filterChannel, filterStatus, filterClient]);

  const selectStyle = useMemo(() => makeSelectStyle(theme), [theme]);

  /** Build a KeyResult from form data */
  const formKRtoKeyResult = (kr: GoalFormKR): KeyResult => ({
    id: crypto.randomUUID(),
    title: kr.title.trim(),
    start: kr.start,
    target: kr.target,
    current: kr.start,
    progress: 0,
    status: 'behind' as const,
    liveConfig: kr.liveConfig,
    syncStatus: kr.liveConfig ? 'pending' : undefined,
  });

  const handleCreate = () => {
    if (!newTitle.trim() || newTitle.length > 200) { toast('Please enter a title (max 200 chars)', COLOR_DANGER, '\u26A0\uFE0F'); return; }
    const krs = newKRs.filter((kr) => kr.title.trim());
    if (krs.length === 0) { toast('Add at least one key result', COLOR_DANGER, '\u26A0\uFE0F'); return; }
    // Validate live KRs have connectionId and sql
    for (const kr of krs) {
      if (kr.liveConfig && (!kr.liveConfig.connectionId || !kr.liveConfig.sql.trim())) {
        toast('Live KRs need a connection and SQL query', COLOR_DANGER, '\u26A0\uFE0F');
        return;
      }
    }
    if (newChannel < 0 || newChannel >= CHANNELS.length) return;
    if (newOwner < 0 || newOwner >= USERS.length) return;
    const goal: Goal = {
      id: nextGoalId(),
      title: newTitle.trim(),
      status: 'behind',
      progress: 0,
      owner: newOwner,
      channel: newChannel,
      period: newPeriod,
      keyResults: krs.map(formKRtoKeyResult),
      ...(newClientIds.length > 0 && {
        clientIds: newClientIds,
        channelScope: newChannelScopeType === 'all'
          ? { type: 'all' as const }
          : { type: 'selected' as const, channelIds: newSelectedChannelIds },
      }),
    };
    addGoal(goal);
    toast(`Goal created: ${goal.title}`, PRIMARY_COLOR, '\u{1F3AF}');
    logAction(`Created goal: ${goal.title}`, currentUser.name, PRIMARY_COLOR);
    setCreateOpen(false);
    setNewTitle('');
    setNewKRs([{ title: '', start: 0, target: 100 }]);
    setNewClientIds([]);
    setNewChannelScopeType('all');
    setNewSelectedChannelIds([]);

    // Auto-sync live KRs after creation
    const liveKRs = goal.keyResults
      .map((kr, idx) => ({ kr, idx }))
      .filter(({ kr }) => kr.liveConfig);
    if (liveKRs.length > 0 && executeBatch) {
      syncGoal(goal.id, goal.keyResults);
    }
  };

  const handleCheckIn = (goalId: string, krIndex: number, goalTitle: string) => {
    checkIn(goalId, krIndex);
    toast('Check-in recorded!', COLOR_SUCCESS, '\u{1F4CB}');
    logAction(`Check-in on "${goalTitle}" KR #${krIndex + 1}`, currentUser.name, COLOR_SUCCESS);
  };

  const openEditModal = (goal: Goal) => {
    setEditGoalId(goal.id);
    setEditTitle(goal.title);
    setEditChannel(goal.channel);
    setEditOwner(goal.owner);
    setEditPeriod(goal.period);
    setEditKRs(goal.keyResults.map((kr) => ({
      title: kr.title,
      start: kr.start,
      target: kr.target,
      liveConfig: kr.liveConfig,
    })));
    setEditClientIds(goal.clientIds ?? []);
    if (goal.channelScope?.type === 'selected') {
      setEditChannelScopeType('selected');
      setEditSelectedChannelIds(goal.channelScope.channelIds);
    } else {
      setEditChannelScopeType('all');
      setEditSelectedChannelIds([]);
    }
  };

  const handleEditSave = () => {
    if (!editGoalId || !editTitle.trim() || editTitle.length > 200) { toast('Please enter a title (max 200 chars)', COLOR_DANGER, '\u26A0\uFE0F'); return; }
    const krs = editKRs.filter((kr) => kr.title.trim());
    if (krs.length === 0) { toast('Add at least one key result', COLOR_DANGER, '\u26A0\uFE0F'); return; }

    const existingGoal = goals.find((g) => g.id === editGoalId);
    if (!existingGoal) return;

    const updatedKRs: KeyResult[] = krs.map((kr, i) => {
      const existing = existingGoal.keyResults[i];
      // If nothing changed on this KR, preserve existing state
      if (existing && existing.title === kr.title && existing.start === kr.start && existing.target === kr.target
        && JSON.stringify(existing.liveConfig) === JSON.stringify(kr.liveConfig)) {
        return existing;
      }
      const range = Math.abs(kr.target - kr.start);
      const current = existing?.current ?? kr.start;
      const progress = range === 0 ? 0 : Math.min(Math.abs(current - kr.start) / range, 1);
      return {
        id: existing?.id ?? crypto.randomUUID(),
        title: kr.title.trim(),
        start: kr.start,
        target: kr.target,
        current,
        progress,
        status: goalStatus(progress),
        liveConfig: kr.liveConfig,
        syncStatus: kr.liveConfig ? (existing?.syncStatus || 'pending') : undefined,
        syncError: kr.liveConfig ? existing?.syncError : undefined,
        lastSyncAt: kr.liveConfig ? existing?.lastSyncAt : undefined,
      };
    });

    updateGoal(editGoalId, {
      title: editTitle.trim(),
      channel: editChannel,
      owner: editOwner,
      period: editPeriod,
      keyResults: updatedKRs,
      ...(editClientIds.length > 0 && {
        clientIds: editClientIds,
        channelScope: editChannelScopeType === 'all'
          ? { type: 'all' as const }
          : { type: 'selected' as const, channelIds: editSelectedChannelIds },
      }),
      ...(editClientIds.length === 0 && {
        clientIds: undefined,
        channelScope: undefined,
      }),
    });
    toast(`Goal updated: ${editTitle.trim()}`, PRIMARY_COLOR, '\u270E');
    logAction(`Updated goal: ${editTitle.trim()}`, currentUser.name, PRIMARY_COLOR);
    setEditGoalId(null);
    setEditClientIds([]);
    setEditChannelScopeType('all');
    setEditSelectedChannelIds([]);

    // Auto-sync live KRs after edit (in case SQL or connection changed)
    const liveKRs = updatedKRs.filter((kr) => kr.liveConfig);
    if (liveKRs.length > 0 && executeBatch) {
      syncGoal(editGoalId, updatedKRs);
    }
  };

  const handleDeleteGoal = (goalId: string, goalTitle: string) => {
    deleteGoal(goalId);
    toast(`Goal deleted: ${goalTitle}`, COLOR_DANGER, '\u{1F5D1}');
    logAction(`Deleted goal: ${goalTitle}`, currentUser.name, COLOR_DANGER);
    setConfirmDeleteId(null);
    setExpanded(null);
  };

  /** Sync all live KRs for a single goal */
  const syncGoal = useCallback(async (goalId: string, keyResults: KeyResult[]) => {
    if (!executeBatch) return;
    const queries = keyResults
      .map((kr, idx) => ({ kr, idx }))
      .filter(({ kr }) => kr.liveConfig)
      .map(({ kr, idx }) => ({
        goalId,
        krIndex: idx,
        connectionId: kr.liveConfig!.connectionId,
        sql: kr.liveConfig!.sql,
        timeframeDays: kr.liveConfig!.timeframeDays,
      }));

    if (queries.length === 0) return;

    setSyncingGoalId(goalId);
    try {
      const { results } = await executeBatch(queries);
      syncLiveKRBatch(results.map((r) => ({
        ...r,
        status: r.status as SyncStatus,
      })));
      const ok = results.filter((r) => r.status === 'ok').length;
      const err = results.filter((r) => r.status !== 'ok').length;
      if (err > 0) {
        toast(`Synced ${ok}/${results.length} KRs (${err} failed)`, COLOR_DANGER, '\u26A0\uFE0F');
      } else {
        toast(`Synced ${ok} live KR${ok > 1 ? 's' : ''}`, COLOR_SUCCESS, '\u{1F4E1}');
      }
    } catch (e) {
      toast(`Sync failed: ${(e as Error).message}`, COLOR_DANGER, '\u26A0\uFE0F');
    } finally {
      setSyncingGoalId(null);
    }
  }, [executeBatch, syncLiveKRBatch, toast]);

  /** Sync all live KRs across all goals */
  const syncAllLiveKRs = useCallback(async () => {
    if (!executeBatch) return;
    const queries: Array<{
      goalId: string;
      krIndex: number;
      connectionId: string;
      sql: string;
      timeframeDays?: number;
    }> = [];
    for (const goal of goals) {
      for (let i = 0; i < goal.keyResults.length; i++) {
        const kr = goal.keyResults[i];
        if (kr.liveConfig) {
          queries.push({
            goalId: goal.id,
            krIndex: i,
            connectionId: kr.liveConfig.connectionId,
            sql: kr.liveConfig.sql,
            timeframeDays: kr.liveConfig.timeframeDays,
          });
        }
      }
    }
    if (queries.length === 0) { toast('No live KRs to sync', COLOR_INFO, '\u{1F4E1}'); return; }

    setSyncingGoalId('all');
    try {
      const { results } = await executeBatch(queries);
      syncLiveKRBatch(results.map((r) => ({
        ...r,
        status: r.status as SyncStatus,
      })));
      const ok = results.filter((r) => r.status === 'ok').length;
      toast(`Synced ${ok}/${results.length} live KRs`, ok === results.length ? COLOR_SUCCESS : COLOR_DANGER, '\u{1F4E1}');
    } catch (e) {
      toast(`Sync failed: ${(e as Error).message}`, COLOR_DANGER, '\u26A0\uFE0F');
    } finally {
      setSyncingGoalId(null);
    }
  }, [executeBatch, goals, syncLiveKRBatch, toast]);

  const hasAnyLiveKRs = goals.some((g) => g.keyResults.some((kr) => kr.liveConfig));

  // Template helpers
  const materializingTemplate = materializeTemplateId
    ? goalTemplates.find((t) => t.id === materializeTemplateId)
    : undefined;

  const getExistingClientIds = (templateId: string): string[] =>
    goals.filter((g) => g.templateId === templateId && g.clientIds?.length).flatMap((g) => g.clientIds ?? []);

  const handleTemplateSave = (template: GoalTemplate) => {
    if (editingTemplate) {
      updateGoalTemplate(template.id, template);
      syncTemplateToGoals(template.id);
      toast(`Template updated: ${template.title} (synced to derived goals)`, PRIMARY_COLOR, '\u270E');
      logAction(`Updated template: ${template.title}`, currentUser.name, PRIMARY_COLOR);
    } else {
      addGoalTemplate(template);
      toast(`Template created: ${template.title}`, PRIMARY_COLOR, '\u{1F4CB}');
      logAction(`Created template: ${template.title}`, currentUser.name, PRIMARY_COLOR);
    }
    setTemplateFormOpen(false);
    setEditingTemplate(undefined);
  };

  const handleMaterialize = (clientIds: string[]) => {
    if (!materializeTemplateId) return;
    const templateId = materializeTemplateId;
    materializeTemplate(templateId, clientIds, currentUser.id);
    const template = goalTemplates.find((t) => t.id === templateId);
    toast(`Materialized "${template?.title}" for ${clientIds.length} client${clientIds.length !== 1 ? 's' : ''}`, COLOR_SUCCESS, '\u{1F4CB}');
    logAction(`Materialized template "${template?.title}" for ${clientIds.length} client(s)`, currentUser.name, COLOR_SUCCESS);
    setMaterializeTemplateId(null);

    // Auto-sync live KRs for newly created goals after store update
    if (executeBatch) {
      // Use a short timeout to allow the store to settle before reading updated goals
      setTimeout(() => {
        const currentGoals = useStore.getState().goals;
        const newGoals = currentGoals.filter(
          (g) => g.templateId === templateId && clientIds.includes(g.clientIds?.[0] ?? ''),
        );
        for (const goal of newGoals) {
          syncGoal(goal.id, goal.keyResults);
        }
      }, 0);
    }
  };

  const handleDeleteTemplate = () => {
    if (!deleteTemplateId) return;
    const template = goalTemplates.find((t) => t.id === deleteTemplateId);
    deleteGoalTemplate(deleteTemplateId, deleteTemplateCascade);
    toast(`Template deleted: ${template?.title}`, COLOR_DANGER, '\u{1F5D1}');
    setDeleteTemplateId(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* View toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          onClick={() => setView('goals')}
          style={{
            padding: '6px 16px',
            borderRadius: 8,
            border: `1px solid ${view === 'goals' ? PRIMARY_COLOR : theme.border}`,
            background: view === 'goals' ? PRIMARY_COLOR : 'transparent',
            color: view === 'goals' ? '#fff' : theme.textSecondary,
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Goals
        </button>
        <button
          onClick={() => setView('templates')}
          style={{
            padding: '6px 16px',
            borderRadius: 8,
            border: `1px solid ${view === 'templates' ? PRIMARY_COLOR : theme.border}`,
            background: view === 'templates' ? PRIMARY_COLOR : 'transparent',
            color: view === 'templates' ? '#fff' : theme.textSecondary,
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Templates ({goalTemplates.length})
        </button>
      </div>

      {/* ──────────── TEMPLATES VIEW ──────────── */}
      {view === 'templates' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1 }} />
            {permissions.canCreate && (
              <button
                onClick={() => { setEditingTemplate(undefined); setTemplateFormOpen(true); }}
                style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: PRIMARY_COLOR, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                + Create Template
              </button>
            )}
          </div>

          {goalTemplates.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: theme.textFaint, fontSize: 14 }}>
              No templates yet — create one to get started.
            </div>
          ) : (
            goalTemplates.map((tpl) => {
              const clientCount = goals.filter((g) => g.templateId === tpl.id && g.clientIds?.length).reduce((acc, g) => {
                const seen = new Set(acc);
                for (const cid of g.clientIds ?? []) seen.add(cid);
                return seen;
              }, new Set<string>()).size;

              return (
                <TemplateCard
                  key={tpl.id}
                  template={tpl}
                  theme={theme}
                  clientCount={clientCount}
                  onEdit={() => { setEditingTemplate(tpl); setTemplateFormOpen(true); }}
                  onMaterialize={() => setMaterializeTemplateId(tpl.id)}
                  onDelete={() => { setDeleteTemplateId(tpl.id); setDeleteTemplateCascade(false); }}
                />
              );
            })
          )}
        </div>
      )}

      {/* ──────────── GOALS VIEW ──────────── */}
      {view === 'goals' && (
        <>
      {/* Filters + Create + Sync All */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <select aria-label="Filter goals by channel" value={filterChannel} onChange={(e) => setFilterChannel(e.target.value)} style={selectStyle}>
          <option value="all">All Channels</option>
          {CHANNELS.map((ch, i) => (
            <option key={i} value={String(i)}>{ch.icon} {ch.name}</option>
          ))}
        </select>
        <select aria-label="Filter goals by status" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={selectStyle}>
          <option value="all">All Statuses</option>
          <option value="on_track">On Track</option>
          <option value="at_risk">At Risk</option>
          <option value="behind">Behind</option>
        </select>
        {clients.length > 0 && (
          <select aria-label="Filter goals by client" value={filterClient} onChange={(e) => setFilterClient(e.target.value)} style={selectStyle}>
            <option value="all">All Clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
        <div style={{ flex: 1 }} />
        {hasAnyLiveKRs && bridgeConnected && (
          <button
            onClick={syncAllLiveKRs}
            disabled={syncingGoalId === 'all'}
            style={{
              padding: '8px 16px', borderRadius: 8, border: 'none',
              background: COLOR_INFO, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              opacity: syncingGoalId === 'all' ? 0.6 : 1,
            }}
          >
            {syncingGoalId === 'all' ? '\u{1F504} Syncing...' : '\u{1F4E1} Sync All Live KRs'}
          </button>
        )}
        {permissions.canCreate && (
          <button
            onClick={() => setCreateOpen(true)}
            style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: PRIMARY_COLOR, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
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
          const isExpanded = expanded === goal.id;
          const owner = safeUser(USERS, goal.owner);
          const hasLiveKRs = goal.keyResults.some((kr) => kr.liveConfig);
          const isSyncing = syncingGoalId === goal.id;
          const isTemplateBacked = !!goal.templateId;

          return (
            <div key={goal.id} style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 10, overflow: 'hidden' }}>
              <div onClick={() => setExpanded(isExpanded ? null : goal.id)} style={{ padding: '16px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
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
                        goal.channelScope.channelIds.map((chId) => {
                          const ownerClient = clients.find((c) => (c.channels || []).some((ch) => ch.id === chId));
                          const chInfo = (ownerClient?.channels || []).find((ch) => ch.id === chId);
                          return chInfo ? (
                            <PillBadge
                              key={chId}
                              label={chInfo.name}
                              color={chInfo.color ?? ownerClient?.color ?? PRIMARY_COLOR}
                            />
                          ) : null;
                        })
                      )
                    ) : (
                      <ChannelBadge channel={safeChannel(CHANNELS, goal.channel)} />
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
                    <button onClick={(e) => { e.stopPropagation(); openEditModal(goal); }} aria-label="Edit goal" style={{ background: 'none', border: `1px solid ${theme.border}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer', color: theme.textSecondary, fontSize: 11, fontWeight: 600 }}>
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
                    {hasLiveKRs && bridgeConnected && (
                      <button
                        onClick={(e) => { e.stopPropagation(); syncGoal(goal.id, goal.keyResults); }}
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
                        <button onClick={(e) => { e.stopPropagation(); handleCheckIn(goal.id, ki, goal.title); }} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: COLOR_SUCCESS, color: '#000', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>Check In</button>
                      )}
                    </div>
                  ))}

                  {permissions.canDelete && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${theme.borderLight}` }}>
                      {confirmDeleteId !== goal.id ? (
                        <button onClick={() => setConfirmDeleteId(goal.id)} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #F871714D', background: '#F8717118', color: COLOR_DANGER, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Delete Goal</button>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 12, color: COLOR_DANGER, fontWeight: 600 }}>Delete this goal?</span>
                          <button onClick={() => handleDeleteGoal(goal.id, goal.title)} style={{ padding: '4px 12px', borderRadius: 6, border: 'none', background: COLOR_DANGER, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Confirm</button>
                          <button onClick={() => setConfirmDeleteId(null)} style={{ padding: '4px 12px', borderRadius: 6, border: `1px solid ${theme.border}`, background: 'transparent', color: theme.text, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}

      {/* Create Goal Modal */}
      <Modal open={createOpen} onClose={() => { setCreateOpen(false); setNewClientIds([]); setNewChannelScopeType('all'); setNewSelectedChannelIds([]); }} title={'\u{1F3AF} New Goal'} theme={theme} width={600}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <GoalFormFields
            title={newTitle} setTitle={setNewTitle}
            channel={newChannel} setChannel={setNewChannel}
            owner={newOwner} setOwner={setNewOwner}
            period={newPeriod} setPeriod={setNewPeriod}
            krs={newKRs} setKRs={setNewKRs}
            theme={theme} selectStyle={selectStyle}
            connections={connections}
            getTables={getTables}
            getColumns={getColumns}
            previewQuery={previewQuery}
            clients={clients}
            selectedClientIds={newClientIds}
            setSelectedClientIds={setNewClientIds}
            channelScopeType={newChannelScopeType}
            setChannelScopeType={setNewChannelScopeType}
            selectedChannelIds={newSelectedChannelIds}
            setSelectedChannelIds={setNewSelectedChannelIds}
          />
          <button onClick={handleCreate} style={{ padding: '10px 16px', borderRadius: 8, border: 'none', background: PRIMARY_COLOR, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginTop: 6 }}>Create Goal</button>
        </div>
      </Modal>

      {/* Edit Goal Modal */}
      <Modal open={!!editGoalId} onClose={() => { setEditGoalId(null); setEditClientIds([]); setEditChannelScopeType('all'); setEditSelectedChannelIds([]); }} title={'\u270E Edit Goal'} theme={theme} width={600}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <GoalFormFields
            title={editTitle} setTitle={setEditTitle}
            channel={editChannel} setChannel={setEditChannel}
            owner={editOwner} setOwner={setEditOwner}
            period={editPeriod} setPeriod={setEditPeriod}
            krs={editKRs} setKRs={setEditKRs}
            theme={theme} selectStyle={selectStyle}
            connections={connections}
            getTables={getTables}
            getColumns={getColumns}
            previewQuery={previewQuery}
            clients={clients}
            selectedClientIds={editClientIds}
            setSelectedClientIds={setEditClientIds}
            channelScopeType={editChannelScopeType}
            setChannelScopeType={setEditChannelScopeType}
            selectedChannelIds={editSelectedChannelIds}
            setSelectedChannelIds={setEditSelectedChannelIds}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button onClick={handleEditSave} style={{ padding: '10px 16px', borderRadius: 8, border: 'none', background: PRIMARY_COLOR, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', flex: 1 }}>Save Changes</button>
            <button onClick={() => { setEditGoalId(null); setEditClientIds([]); setEditChannelScopeType('all'); setEditSelectedChannelIds([]); }} style={{ padding: '10px 16px', borderRadius: 8, border: `1px solid ${theme.border}`, background: 'transparent', color: theme.text, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      </Modal>
      </>
      )}

      {/* ──── Template modals (rendered outside view guard so they persist across view switches) ──── */}
      <TemplateForm
        open={templateFormOpen}
        onClose={() => { setTemplateFormOpen(false); setEditingTemplate(undefined); }}
        theme={theme}
        template={editingTemplate}
        onSave={handleTemplateSave}
      />

      {materializingTemplate && (
        <MaterializeModal
          open={!!materializeTemplateId}
          onClose={() => setMaterializeTemplateId(null)}
          theme={theme}
          template={materializingTemplate}
          clients={clients}
          existingClientIds={getExistingClientIds(materializingTemplate.id)}
          onMaterialize={handleMaterialize}
        />
      )}

      {/* Delete Template Confirm Modal */}
      <Modal
        open={!!deleteTemplateId}
        onClose={() => setDeleteTemplateId(null)}
        title="\u{1F5D1} Delete Template"
        theme={theme}
        width={440}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ fontSize: 13, color: theme.text, margin: 0 }}>
            Are you sure you want to delete this template? Choose what happens to goals derived from it:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: theme.text }}>
              <input
                type="radio"
                name="deleteMode"
                checked={!deleteTemplateCascade}
                onChange={() => setDeleteTemplateCascade(false)}
                style={{ accentColor: PRIMARY_COLOR }}
              />
              Unlink goals (keep goals, remove template link)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: COLOR_DANGER }}>
              <input
                type="radio"
                name="deleteMode"
                checked={deleteTemplateCascade}
                onChange={() => setDeleteTemplateCascade(true)}
                style={{ accentColor: COLOR_DANGER }}
              />
              Cascade delete (delete template AND all derived goals)
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleDeleteTemplate}
              style={{ flex: 1, padding: '9px 16px', borderRadius: 8, border: 'none', background: COLOR_DANGER, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
            >
              Confirm Delete
            </button>
            <button
              onClick={() => setDeleteTemplateId(null)}
              style={{ padding: '9px 16px', borderRadius: 8, border: `1px solid ${theme.border}`, background: 'transparent', color: theme.text, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
