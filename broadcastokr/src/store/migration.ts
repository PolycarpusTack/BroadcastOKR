import type { ChannelScope, Client, Goal, ScopedChannelRef, Task } from '../types';

/** Ensure all KeyResults have an `id` field (migration for pre-existing data) */
export function migrateKRIds(goals: Goal[]): Goal[] {
  let anyChanged = false;
  const result = goals.map((g) => {
    let goalChanged = false;
    const krs = g.keyResults.map((kr) => {
      if (kr.id) return kr;
      goalChanged = true;
      return { ...kr, id: crypto.randomUUID() };
    });
    if (goalChanged) anyChanged = true;
    return goalChanged ? { ...g, keyResults: krs } : g;
  });
  return anyChanged ? result : goals;
}

function isLegacySelectedScope(
  scope: ChannelScope | { type: 'selected'; channelIds: string[] } | undefined,
): scope is { type: 'selected'; channelIds: string[] } {
  return !!scope && scope.type === 'selected' && Array.isArray((scope as { channelIds?: unknown }).channelIds);
}

function dedupeScopedChannels(channels: ScopedChannelRef[]): ScopedChannelRef[] {
  const seen = new Set<string>();
  const deduped: ScopedChannelRef[] = [];

  for (const channel of channels) {
    const key = `${channel.clientId}::${channel.channelId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(channel);
  }

  return deduped;
}

function migrateChannelScope(
  scope: ChannelScope | { type: 'selected'; channelIds: string[] } | undefined,
  clientIds: string[] | undefined,
  clients: Client[],
): ChannelScope | undefined {
  if (!isLegacySelectedScope(scope)) return scope;
  if (!clientIds?.length || scope.channelIds.length === 0) {
    return { type: 'all' };
  }

  const selectedClients = clients.filter((client) => clientIds.includes(client.id));
  const migratedChannels = dedupeScopedChannels(
    selectedClients.flatMap((client) =>
      scope.channelIds
        .filter((channelId) => client.channels.some((channel) => channel.id === channelId))
        .map((channelId) => ({ clientId: client.id, channelId })),
    ),
  );

  return migratedChannels.length > 0
    ? { type: 'selected', channels: migratedChannels }
    : { type: 'all' };
}

export function migrateClientChannelScopes(goals: Goal[], tasks: Task[], clients: Client[]) {
  let goalsChanged = false;
  let tasksChanged = false;

  const migratedGoals = goals.map((goal) => {
    const channelScope = migrateChannelScope(goal.channelScope, goal.clientIds, clients);
    if (channelScope === goal.channelScope) return goal;
    goalsChanged = true;
    return { ...goal, channelScope };
  });

  const migratedTasks = tasks.map((task) => {
    const channelScope = migrateChannelScope(task.channelScope, task.clientIds, clients);
    if (channelScope === task.channelScope) return task;
    tasksChanged = true;
    return { ...task, channelScope };
  });

  return {
    goals: goalsChanged ? migratedGoals : goals,
    tasks: tasksChanged ? migratedTasks : tasks,
  };
}
