import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../store';
import type { Client, GoalTemplate, Task } from '../../types';

const testClient: Client = {
  id: 'test-vrt', name: 'VRT', connectionId: 'conn-1',
  color: '#3805E3', tags: ['tier-1'], channels: [
    { id: 'main', name: 'Main' },
  ],
};

const testTemplate: GoalTemplate = {
  id: 'tpl-1', title: 'HC - Long Term Planning', category: 'Health Check',
  period: 'Q1 2026',
  krTemplates: [
    { id: 'kr-tpl-1', title: 'Rights Coverage', sql: 'SELECT COUNT(*) FROM psi.rights', unit: '%', direction: 'hi', start: 0, target: 100 },
    { id: 'kr-tpl-2', title: 'Media Coverage', sql: 'SELECT COUNT(*) FROM psi.media', unit: '%', direction: 'hi', start: 0, target: 100 },
  ],
};

beforeEach(() => {
  useStore.setState({ clients: [], goalTemplates: [], goals: [], tasks: [] });
});

describe('client actions', () => {
  it('addClient adds a client', () => {
    useStore.getState().addClient(testClient);
    expect(useStore.getState().clients).toHaveLength(1);
    expect(useStore.getState().clients[0].name).toBe('VRT');
  });

  it('updateClient updates fields', () => {
    useStore.getState().addClient(testClient);
    useStore.getState().updateClient('test-vrt', { name: 'VRT Updated' });
    expect(useStore.getState().clients[0].name).toBe('VRT Updated');
  });

  it('updateClient rebinds live KRs and resets scoped channels when connection changes', () => {
    const scopedGoal = {
      id: 'goal-1',
      title: 'Scoped goal',
      status: 'behind' as const,
      progress: 0,
      owner: 0,
      channel: 0,
      period: 'Q1 2026',
      clientIds: ['test-vrt'],
      channelScope: {
        type: 'selected' as const,
        channels: [{ clientId: 'test-vrt', channelId: 'main' }],
      },
      keyResults: [{
        id: 'kr-1',
        title: 'Live KR',
        start: 0,
        target: 100,
        current: 0,
        progress: 0,
        status: 'behind' as const,
        liveConfig: {
          connectionId: 'conn-1',
          sql: 'SELECT 1',
          unit: 'count',
          direction: 'hi' as const,
        },
        syncStatus: 'pending' as const,
      }],
    };
    const scopedTask: Task = {
      id: 'task-1',
      title: 'Scoped task',
      status: 'todo',
      priority: 'medium',
      assignee: 0,
      channel: 0,
      due: '2026-04-01',
      taskType: 'task',
      subtasks: [],
      clientIds: ['test-vrt'],
      channelScope: {
        type: 'selected',
        channels: [{ clientId: 'test-vrt', channelId: 'main' }],
      },
    };

    useStore.setState({ goals: [scopedGoal], tasks: [scopedTask] });
    useStore.getState().addClient(testClient);

    useStore.getState().updateClient('test-vrt', { connectionId: 'conn-2' });

    const updatedClient = useStore.getState().clients[0];
    const updatedGoal = useStore.getState().goals.find((goal) => goal.clientIds?.includes('test-vrt'));
    const updatedTask = useStore.getState().tasks[0];

    expect(updatedClient.connectionId).toBe('conn-2');
    expect(updatedClient.channels).toEqual([]);
    expect(updatedGoal?.keyResults[0].liveConfig?.connectionId).toBe('conn-2');
    expect(updatedGoal?.channelScope).toEqual({ type: 'all' });
    expect(updatedTask.channelScope).toEqual({ type: 'all' });
  });

  it('deleteClient with cascade removes client and its goals', () => {
    useStore.getState().addClient(testClient);
    useStore.getState().addGoalTemplate(testTemplate);
    useStore.getState().materializeTemplate('tpl-1', ['test-vrt']);
    expect(useStore.getState().goals.some(g => g.clientIds?.includes('test-vrt'))).toBe(true);
    useStore.getState().deleteClient('test-vrt', true);
    expect(useStore.getState().clients).toHaveLength(0);
    expect(useStore.getState().goals.some(g => g.clientIds?.includes('test-vrt'))).toBe(false);
  });

  it('deleteClient without cascade unlinks goals', () => {
    useStore.getState().addClient(testClient);
    useStore.getState().addGoalTemplate(testTemplate);
    useStore.getState().materializeTemplate('tpl-1', ['test-vrt']);
    useStore.getState().deleteClient('test-vrt', false);
    expect(useStore.getState().clients).toHaveLength(0);
    const remaining = useStore.getState().goals.filter(g => g.title.includes('Long Term'));
    expect(remaining.length).toBeGreaterThan(0);
    expect(remaining[0].clientIds).toBeUndefined();
    expect(remaining[0].templateId).toBeUndefined();
  });
});

describe('template actions', () => {
  it('addGoalTemplate adds a template', () => {
    useStore.getState().addGoalTemplate(testTemplate);
    expect(useStore.getState().goalTemplates).toHaveLength(1);
  });

  it('deleteGoalTemplate with cascade removes template and goals', () => {
    useStore.getState().addClient(testClient);
    useStore.getState().addGoalTemplate(testTemplate);
    useStore.getState().materializeTemplate('tpl-1', ['test-vrt']);
    useStore.getState().deleteGoalTemplate('tpl-1', true);
    expect(useStore.getState().goalTemplates).toHaveLength(0);
    expect(useStore.getState().goals.filter(g => g.templateId === 'tpl-1')).toHaveLength(0);
  });
});

describe('materializeTemplate', () => {
  it('creates one goal per client with correct liveConfig', () => {
    useStore.getState().addClient(testClient);
    useStore.getState().addGoalTemplate(testTemplate);
    useStore.getState().materializeTemplate('tpl-1', ['test-vrt']);
    const goals = useStore.getState().goals.filter(g => g.templateId === 'tpl-1');
    expect(goals).toHaveLength(1);
    expect(goals[0].clientIds).toEqual(['test-vrt']);
    expect(goals[0].keyResults).toHaveLength(2);
    expect(goals[0].keyResults[0].liveConfig?.connectionId).toBe('conn-1');
    expect(goals[0].keyResults[0].liveConfig?.sql).toBe('SELECT COUNT(*) FROM psi.rights');
    expect(goals[0].keyResults[0].krTemplateId).toBe('kr-tpl-1');
  });

  it('skips already-materialized client+template pairs', () => {
    useStore.getState().addClient(testClient);
    useStore.getState().addGoalTemplate(testTemplate);
    useStore.getState().materializeTemplate('tpl-1', ['test-vrt']);
    useStore.getState().materializeTemplate('tpl-1', ['test-vrt']);
    const goals = useStore.getState().goals.filter(g => g.templateId === 'tpl-1');
    expect(goals).toHaveLength(1);
  });

  it('uses client sqlOverrides when present', () => {
    const clientWithOverride: Client = {
      ...testClient,
      sqlOverrides: { 'tpl-1': { 'kr-tpl-1': 'SELECT COUNT(*) FROM vrt_custom.rights' } },
    };
    useStore.getState().addClient(clientWithOverride);
    useStore.getState().addGoalTemplate(testTemplate);
    useStore.getState().materializeTemplate('tpl-1', ['test-vrt']);
    const goal = useStore.getState().goals.find(g => g.clientIds?.includes('test-vrt'));
    expect(goal?.keyResults[0].liveConfig?.sql).toBe('SELECT COUNT(*) FROM vrt_custom.rights');
    expect(goal?.keyResults[1].liveConfig?.sql).toBe('SELECT COUNT(*) FROM psi.media');
  });
});

describe('syncTemplateToGoals', () => {
  it('updates SQL in materialized goals', () => {
    useStore.getState().addClient(testClient);
    useStore.getState().addGoalTemplate(testTemplate);
    useStore.getState().materializeTemplate('tpl-1', ['test-vrt']);
    useStore.getState().updateGoalTemplate('tpl-1', {
      krTemplates: [
        { ...testTemplate.krTemplates[0], sql: 'SELECT COUNT(*) FROM psi.rights_v2' },
        testTemplate.krTemplates[1],
      ],
    });
    useStore.getState().syncTemplateToGoals('tpl-1');
    const goal = useStore.getState().goals.find(g => g.clientIds?.includes('test-vrt'));
    expect(goal?.keyResults[0].liveConfig?.sql).toBe('SELECT COUNT(*) FROM psi.rights_v2');
  });

  it('skips SQL update for clients with overrides', () => {
    const clientWithOverride: Client = {
      ...testClient,
      sqlOverrides: { 'tpl-1': { 'kr-tpl-1': 'SELECT COUNT(*) FROM vrt_custom.rights' } },
    };
    useStore.getState().addClient(clientWithOverride);
    useStore.getState().addGoalTemplate(testTemplate);
    useStore.getState().materializeTemplate('tpl-1', ['test-vrt']);
    useStore.getState().updateGoalTemplate('tpl-1', {
      krTemplates: [
        { ...testTemplate.krTemplates[0], sql: 'SELECT COUNT(*) FROM psi.rights_v2' },
        testTemplate.krTemplates[1],
      ],
    });
    useStore.getState().syncTemplateToGoals('tpl-1');
    const goal = useStore.getState().goals.find(g => g.clientIds?.includes('test-vrt'));
    expect(goal?.keyResults[0].liveConfig?.sql).toBe('SELECT COUNT(*) FROM vrt_custom.rights');
  });

  it('removes KRs no longer in template', () => {
    useStore.getState().addClient(testClient);
    useStore.getState().addGoalTemplate(testTemplate);
    useStore.getState().materializeTemplate('tpl-1', ['test-vrt']);
    useStore.getState().updateGoalTemplate('tpl-1', {
      krTemplates: [testTemplate.krTemplates[0]],
    });
    useStore.getState().syncTemplateToGoals('tpl-1');
    const goal = useStore.getState().goals.find(g => g.clientIds?.includes('test-vrt'));
    expect(goal?.keyResults).toHaveLength(1);
    expect(goal?.keyResults[0].krTemplateId).toBe('kr-tpl-1');
  });

  it('appends new KRs from template', () => {
    useStore.getState().addClient(testClient);
    useStore.getState().addGoalTemplate(testTemplate);
    useStore.getState().materializeTemplate('tpl-1', ['test-vrt']);
    useStore.getState().updateGoalTemplate('tpl-1', {
      krTemplates: [
        ...testTemplate.krTemplates,
        { id: 'kr-tpl-3', title: 'New KR', sql: 'SELECT 1', unit: 'count', direction: 'hi' as const, start: 0, target: 50 },
      ],
    });
    useStore.getState().syncTemplateToGoals('tpl-1');
    const goal = useStore.getState().goals.find(g => g.clientIds?.includes('test-vrt'));
    expect(goal?.keyResults).toHaveLength(3);
    expect(goal?.keyResults[2].krTemplateId).toBe('kr-tpl-3');
  });
});
