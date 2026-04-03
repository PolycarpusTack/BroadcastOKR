import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../store';
import type { User, Team, Goal, Task } from '../../types';

const makeUser = (id: number, name = `User ${id}`): User => ({
  id, name, role: 'member', av: name[0], color: '#000', dept: 'Ops', title: 'Tester',
});

const makeTeam = (id: string, members: number[], leadId?: number): Team => ({
  id, name: `Team ${id}`, members, color: '#000', icon: '📋', leadId,
});

const makeGoal = (id: string, owner: number): Goal => ({
  id, title: `Goal ${id}`, status: 'behind', progress: 0, owner, channel: 0,
  period: 'Q1 2026', keyResults: [],
});

const makeTask = (id: string, assignee: number): Task => ({
  id, title: `Task ${id}`, status: 'todo', priority: 'medium', assignee, channel: 0,
  due: '2026-04-01', taskType: 'task', subtasks: [],
});

beforeEach(() => {
  useStore.setState({
    users: [makeUser(1), makeUser(2), makeUser(3)],
    teams: [makeTeam('t1', [1, 2], 1), makeTeam('t2', [3])],
    goals: [makeGoal('g1', 1), makeGoal('g2', 2)],
    tasks: [makeTask('tk1', 1), makeTask('tk2', 2)],
    clients: [],
  });
});

describe('user actions', () => {
  it('addUser adds user to array', () => {
    useStore.getState().addUser(makeUser(10, 'New'));
    const users = useStore.getState().users;
    expect(users).toHaveLength(4);
    expect(users[3].name).toBe('New');
  });

  it('updateUser merges partial updates', () => {
    useStore.getState().updateUser(1, { name: 'Updated', dept: 'New Dept' });
    const user = useStore.getState().users.find(u => u.id === 1)!;
    expect(user.name).toBe('Updated');
    expect(user.dept).toBe('New Dept');
    expect(user.role).toBe('member'); // unchanged
  });

  it('deleteUser with reassignTo reassigns tasks and goals', () => {
    useStore.getState().deleteUser(1, 5);
    const state = useStore.getState();

    // User removed
    expect(state.users.find(u => u.id === 1)).toBeUndefined();

    // Tasks reassigned
    expect(state.tasks.find(t => t.id === 'tk1')!.assignee).toBe(5);
    expect(state.tasks.find(t => t.id === 'tk2')!.assignee).toBe(2); // untouched

    // Goals reassigned
    expect(state.goals.find(g => g.id === 'g1')!.owner).toBe(5);
    expect(state.goals.find(g => g.id === 'g2')!.owner).toBe(2); // untouched

    // Removed from team members
    expect(state.teams.find(t => t.id === 't1')!.members).toEqual([2]);

    // leadId cleared since it was user 1
    expect(state.teams.find(t => t.id === 't1')!.leadId).toBeUndefined();
  });

  it('deleteUser with reassignTo=null reassigns to first remaining user', () => {
    // beforeEach sets users [1, 2, 3]; after deleting 1, remaining[0] is user 2
    useStore.getState().deleteUser(1, null);
    const state = useStore.getState();
    expect(state.tasks.find(t => t.id === 'tk1')!.assignee).toBe(2);
    expect(state.goals.find(g => g.id === 'g1')!.owner).toBe(2);
  });

  it('deleteUser blocked for last user', () => {
    useStore.setState({ users: [makeUser(1)] });
    useStore.getState().deleteUser(1, null);
    // No state change — user still exists
    expect(useStore.getState().users).toHaveLength(1);
  });
});

describe('team actions', () => {
  it('addTeam adds team', () => {
    useStore.getState().addTeam(makeTeam('t3', [1, 2, 3]));
    expect(useStore.getState().teams).toHaveLength(3);
  });

  it('updateTeam merges updates', () => {
    useStore.getState().updateTeam('t1', { name: 'Renamed' });
    const team = useStore.getState().teams.find(t => t.id === 't1')!;
    expect(team.name).toBe('Renamed');
    expect(team.members).toEqual([1, 2]); // unchanged
  });

  it('updateTeam clears leadId when members no longer includes lead', () => {
    // t1 has leadId=1, members=[1,2]
    useStore.getState().updateTeam('t1', { members: [2, 3] });
    const team = useStore.getState().teams.find(t => t.id === 't1')!;
    expect(team.leadId).toBeUndefined();
    expect(team.members).toEqual([2, 3]);
  });

  it('deleteTeam removes team', () => {
    useStore.getState().deleteTeam('t1');
    expect(useStore.getState().teams).toHaveLength(1);
    expect(useStore.getState().teams[0].id).toBe('t2');
  });
});

describe('deleteClient cascade to user/team clientIds', () => {
  it('removes client ID from user.clientIds and team.clientIds', () => {
    useStore.setState({
      users: [
        { ...makeUser(1), clientIds: ['c1', 'c2'] },
        { ...makeUser(2), clientIds: ['c1'] },
        makeUser(3), // no clientIds
      ],
      teams: [
        { ...makeTeam('t1', [1, 2]), clientIds: ['c1', 'c3'] },
        { ...makeTeam('t2', [3]), clientIds: ['c2'] },
      ],
      clients: [{ id: 'c1', name: 'C1', connectionId: 'x', color: '#000', channels: [] }],
      goals: [],
      tasks: [],
    });

    useStore.getState().deleteClient('c1', false);
    const state = useStore.getState();

    expect(state.users.find(u => u.id === 1)!.clientIds).toEqual(['c2']);
    expect(state.users.find(u => u.id === 2)!.clientIds).toEqual([]);
    expect(state.users.find(u => u.id === 3)!.clientIds).toBeUndefined(); // unchanged

    expect(state.teams.find(t => t.id === 't1')!.clientIds).toEqual(['c3']);
    expect(state.teams.find(t => t.id === 't2')!.clientIds).toEqual(['c2']); // unchanged
  });
});
