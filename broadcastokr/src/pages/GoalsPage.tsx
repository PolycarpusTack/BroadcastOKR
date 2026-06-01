import { useState, useMemo, useCallback, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useActivityLog } from '../context/ActivityLogContext';
import { useStore } from '../store/store';
import { useShallow } from 'zustand/react/shallow';
import { CHANNELS } from '../constants';
import { selectStyle as makeSelectStyle } from '../utils/styles';
import { Modal } from '../components/ui/Modal';
import { GoalCard } from '../components/goals/GoalCard';
import { GoalFormFields } from '../components/goals/GoalFormFields';
import type { GoalFormKR } from '../components/goals/GoalFormFields';
import { CheckInModal } from '../components/goals/CheckInModal';
import { TemplateCard } from '../components/templates/TemplateCard';
import { TemplateForm } from '../components/templates/TemplateForm';
import { MaterializeModal } from '../components/templates/MaterializeModal';
import { goalStatus } from '../utils/colors';
import { nextGoalId } from '../utils/ids';
import { PRIMARY_COLOR, COLOR_SUCCESS, COLOR_DANGER, COLOR_INFO } from '../constants/config';
import type { Goal, KeyResult, SyncStatus, GoalTemplate, ScopedChannelRef } from '../types';
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
  getTables, getColumns, previewQuery, executeBatch,
}: GoalsPageProps) {
  const { theme } = useTheme();
  const { currentUser, permissions } = useAuth();
  const { toast } = useToast();
  const { logAction } = useActivityLog();
  const {
    goals, addGoal, checkInKR, updateGoal, deleteGoal, syncLiveKRBatch, setMonitor,
    goalTemplates, clients, users,
    addGoalTemplate, updateGoalTemplate, deleteGoalTemplate,
    materializeTemplate, syncTemplateToGoals,
  } = useStore(
    useShallow((s) => ({
      goals: s.goals,
      addGoal: s.addGoal,
      checkInKR: s.checkInKR,
      updateGoal: s.updateGoal,
      deleteGoal: s.deleteGoal,
      syncLiveKRBatch: s.syncLiveKRBatch,
      setMonitor: s.setMonitor,
      goalTemplates: s.goalTemplates,
      clients: s.clients,
      users: s.users,
      addGoalTemplate: s.addGoalTemplate,
      updateGoalTemplate: s.updateGoalTemplate,
      deleteGoalTemplate: s.deleteGoalTemplate,
      materializeTemplate: s.materializeTemplate,
      syncTemplateToGoals: s.syncTemplateToGoals,
    })),
  );

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
  const [monitorOpen, setMonitorOpen] = useState<string | null>(null);

  const [checkInTarget, setCheckInTarget] = useState<{ goalId: string; krIndex: number; krId: string } | null>(null);

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
  const [newSelectedChannels, setNewSelectedChannels] = useState<ScopedChannelRef[]>([]);

  // Edit modal state
  const [editGoalId, setEditGoalId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editChannel, setEditChannel] = useState(0);
  const [editOwner, setEditOwner] = useState(0);
  const [editPeriod, setEditPeriod] = useState('');
  const [editKRs, setEditKRs] = useState<GoalFormKR[]>([]);
  const [editClientIds, setEditClientIds] = useState<string[]>([]);
  const [editChannelScopeType, setEditChannelScopeType] = useState<'all' | 'selected'>('all');
  const [editSelectedChannels, setEditSelectedChannels] = useState<ScopedChannelRef[]>([]);

  // Re-fetch connections when create/edit modal opens (picks up new connections from KPIConfigModal)
  useEffect(() => {
    if (createOpen || editGoalId) refreshConnections();
  }, [createOpen, editGoalId, refreshConnections]);

  const filtered = useMemo(() => goals.filter((g) => {
    if (filterChannel !== 'all' && g.channel !== Number(filterChannel)) return false;
    if (filterStatus !== 'all' && goalStatus(g.progress) !== filterStatus) return false;
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
    if (newClientIds.length > 0 && newChannelScopeType === 'selected' && newSelectedChannels.length === 0) {
      toast('Select at least one scoped channel', COLOR_DANGER, '\u26A0\uFE0F');
      return;
    }
    if (newChannel < 0 || newChannel >= CHANNELS.length) return;
    if (!users.find((u) => u.id === newOwner)) return;
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
          : { type: 'selected' as const, channels: newSelectedChannels },
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
    setNewSelectedChannels([]);

    // Auto-sync live KRs after creation
    const liveKRs = goal.keyResults
      .map((kr, idx) => ({ kr, idx }))
      .filter(({ kr }) => kr.liveConfig);
    if (liveKRs.length > 0 && executeBatch) {
      syncGoal(goal.id, goal.keyResults);
    }
  };

  const openEditModal = (goal: Goal) => {
    setEditGoalId(goal.id);
    setEditTitle(goal.title);
    setEditChannel(goal.channel);
    setEditOwner(goal.owner);
    setEditPeriod(goal.period);
    setEditKRs(goal.keyResults.map((kr) => ({
      id: kr.id,
      title: kr.title,
      start: kr.start,
      target: kr.target,
      liveConfig: kr.liveConfig,
    })));
    setEditClientIds(goal.clientIds ?? []);
    if (goal.channelScope?.type === 'selected') {
      setEditChannelScopeType('selected');
      setEditSelectedChannels(goal.channelScope.channels);
    } else {
      setEditChannelScopeType('all');
      setEditSelectedChannels([]);
    }
  };

  const handleEditSave = () => {
    if (!editGoalId || !editTitle.trim() || editTitle.length > 200) { toast('Please enter a title (max 200 chars)', COLOR_DANGER, '\u26A0\uFE0F'); return; }
    const krs = editKRs.filter((kr) => kr.title.trim());
    if (krs.length === 0) { toast('Add at least one key result', COLOR_DANGER, '\u26A0\uFE0F'); return; }
    if (editClientIds.length > 0 && editChannelScopeType === 'selected' && editSelectedChannels.length === 0) {
      toast('Select at least one scoped channel', COLOR_DANGER, '\u26A0\uFE0F');
      return;
    }

    const existingGoal = goals.find((g) => g.id === editGoalId);
    if (!existingGoal) return;

    const updatedKRs: KeyResult[] = krs.map((kr) => {
      const existing = kr.id ? existingGoal.keyResults.find((e) => e.id === kr.id) : undefined;
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
        history: existing?.history,
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
          : { type: 'selected' as const, channels: editSelectedChannels },
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
    setEditSelectedChannels([]);

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
      .filter((kr) => kr.liveConfig)
      .map((kr, idx) => ({
        goalId,
        krIndex: idx,
        krId: kr.id,
        connectionId: kr.liveConfig!.connectionId,
        sql: kr.liveConfig!.sql,
        timeframeDays: kr.liveConfig!.timeframeDays,
      }));

    if (queries.length === 0) return;

    setSyncingGoalId(goalId);
    try {
      const { results } = await executeBatch(queries);
      syncLiveKRBatch(results.map((r, i) => ({
        ...r,
        krId: queries[i]?.krId ?? '',
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
      krId: string;
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
            krId: kr.id,
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
      syncLiveKRBatch(results.map((r, i) => ({
        ...r,
        krId: queries[i]?.krId ?? '',
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
                  permissions={permissions}
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
        filtered.map((goal) => (
          <GoalCard
            key={goal.id}
            goal={goal}
            theme={theme}
            isExpanded={expanded === goal.id}
            onToggleExpand={setExpanded}
            users={users}
            channels={CHANNELS}
            clients={clients}
            permissions={permissions}
            bridgeConnected={bridgeConnected}
            syncingGoalId={syncingGoalId}
            confirmDeleteId={confirmDeleteId}
            monitorOpen={monitorOpen}
            onEdit={openEditModal}
            onDelete={handleDeleteGoal}
            onSetConfirmDeleteId={setConfirmDeleteId}
            onCheckIn={setCheckInTarget}
            onSyncGoal={syncGoal}
            onSetMonitor={setMonitor}
            onSetMonitorOpen={setMonitorOpen}
          />
        ))
      )}

      {/* Create Goal Modal */}
      <Modal open={createOpen} onClose={() => { setCreateOpen(false); setNewClientIds([]); setNewChannelScopeType('all'); setNewSelectedChannels([]); }} title={'\u{1F3AF} New Goal'} theme={theme} width={600}>
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
            selectedChannels={newSelectedChannels}
            setSelectedChannels={setNewSelectedChannels}
          />
          <button onClick={handleCreate} style={{ padding: '10px 16px', borderRadius: 8, border: 'none', background: PRIMARY_COLOR, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginTop: 6 }}>Create Goal</button>
        </div>
      </Modal>

      {/* Edit Goal Modal */}
      <Modal open={!!editGoalId} onClose={() => { setEditGoalId(null); setEditClientIds([]); setEditChannelScopeType('all'); setEditSelectedChannels([]); }} title={'\u270E Edit Goal'} theme={theme} width={600}>
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
            selectedChannels={editSelectedChannels}
            setSelectedChannels={setEditSelectedChannels}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button onClick={handleEditSave} style={{ padding: '10px 16px', borderRadius: 8, border: 'none', background: PRIMARY_COLOR, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', flex: 1 }}>Save Changes</button>
            <button onClick={() => { setEditGoalId(null); setEditClientIds([]); setEditChannelScopeType('all'); setEditSelectedChannels([]); }} style={{ padding: '10px 16px', borderRadius: 8, border: `1px solid ${theme.border}`, background: 'transparent', color: theme.text, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      </Modal>

      {checkInTarget && (() => {
        const goal = goals.find(g => g.id === checkInTarget.goalId);
        const kr = goal?.keyResults[checkInTarget.krIndex];
        if (!goal || !kr) return null;
        return (
          <CheckInModal
            open={true}
            onClose={() => setCheckInTarget(null)}
            onSubmit={(entry) => {
              checkInKR(checkInTarget.goalId, checkInTarget.krId, { ...entry, actor: currentUser.name });
              toast('Check-in recorded!', COLOR_SUCCESS, '\u{1F4CB}');
              logAction(`Check-in on "${goal.title}" KR "${kr.title}"`, currentUser.name, COLOR_SUCCESS);
              setCheckInTarget(null);
            }}
            krTitle={kr.title}
            currentValue={kr.current}
            krStatus={kr.status}
            isLive={!!kr.liveConfig}
            theme={theme}
          />
        );
      })()}
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
