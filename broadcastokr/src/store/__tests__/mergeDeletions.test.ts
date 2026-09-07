import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../store';
import type { Goal, Task, Client, User, Team, GoalTemplate } from '../../types';

// ADR-B4 (F6): the change poll carries deletions; they apply before the rows.

const goal = (id: string, title = id): Goal => ({ id, title, status: 'behind', progress: 0, owner: 1, channel: 0, period: 'Q3', keyResults: [], version: 1 });
const task = (id: string): Task => ({ id, title: id, status: 'todo', priority: 'low', assignee: 1, channel: 0, due: '2026-09-10', taskType: 'task', subtasks: [], version: 1 });
const client = (id: string): Client => ({ id, name: id, connectionId: '', color: '#000', channels: [] });
const user = (id: number): User => ({ id, name: `u${id}`, role: 'member', av: 'U', color: '#000', dept: '', title: '' });
const team = (id: string): Team => ({ id, name: id, members: [], color: '#000', icon: 'x' });
const tpl = (id: string): GoalTemplate => ({ id, title: id, category: 'General', period: 'Q3', krTemplates: [] });

describe('_mergeChanges applies deletions before upserts', () => {
  beforeEach(() => {
    useStore.setState({
      goals: [goal('g1'), goal('g2')], tasks: [task('t1'), task('t2')], clients: [client('c1')],
      users: [user(1), user(2)], teams: [team('tm1')], goalTemplates: [tpl('tpl1')],
    });
  });

  it('removes every deleted id from its slice and leaves the rest', () => {
    useStore.getState()._mergeChanges({ deletions: { goals: ['g1'], tasks: ['t2'], clients: ['c1'], users: ['2'], teams: ['tm1'], goalTemplates: ['tpl1'] } });
    const s = useStore.getState();
    expect(s.goals.map((g) => g.id)).toEqual(['g2']);
    expect(s.tasks.map((t) => t.id)).toEqual(['t1']);
    expect(s.clients).toEqual([]);
    expect(s.users.map((u) => u.id)).toEqual([1]);
    expect(s.teams).toEqual([]);
    expect(s.goalTemplates).toEqual([]);
  });

  it('an id in both deletions and rows was recreated — the row wins', () => {
    useStore.getState()._mergeChanges({ deletions: { goals: ['g1'] }, goals: [goal('g1', 'recreated')] });
    const g = useStore.getState().goals.find((x) => x.id === 'g1');
    expect(g?.title).toBe('recreated');
    expect(useStore.getState().goals).toHaveLength(2);
  });

  it('unknown ids and empty lists are no-ops; slices without deletions keep identity', () => {
    const before = useStore.getState();
    useStore.getState()._mergeChanges({ deletions: { goals: ['nope'], tasks: [] } });
    const after = useStore.getState();
    expect(after.goals).toBe(before.goals);
    expect(after.tasks).toBe(before.tasks);
    expect(after.users).toBe(before.users);
  });

  it('applying the same deletions twice converges', () => {
    useStore.getState()._mergeChanges({ deletions: { goals: ['g1'] } });
    useStore.getState()._mergeChanges({ deletions: { goals: ['g1'] } });
    expect(useStore.getState().goals.map((g) => g.id)).toEqual(['g2']);
  });
});
