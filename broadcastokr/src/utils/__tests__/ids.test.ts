import { describe, it, expect } from 'vitest';
import { nextTaskId, nextGoalId, nextStressTaskId } from '../ids';

describe('nextTaskId', () => {
  it('returns unique task IDs with t prefix', () => {
    const id1 = nextTaskId();
    const id2 = nextTaskId();
    expect(id1).toMatch(/^t\d+$/);
    expect(id2).toMatch(/^t\d+$/);
    expect(id1).not.toBe(id2);
  });
});

describe('nextGoalId', () => {
  it('returns unique goal IDs with g prefix', () => {
    const id1 = nextGoalId();
    const id2 = nextGoalId();
    expect(id1).toMatch(/^g\d+$/);
    expect(id2).toMatch(/^g\d+$/);
    expect(id1).not.toBe(id2);
  });
});

describe('nextStressTaskId', () => {
  it('returns unique stress task IDs with ts prefix', () => {
    const id1 = nextStressTaskId();
    const id2 = nextStressTaskId();
    expect(id1).toMatch(/^ts\d+$/);
    expect(id2).toMatch(/^ts\d+$/);
    expect(id1).not.toBe(id2);
  });

  it('does not collide with regular task IDs', () => {
    const taskId = nextTaskId();
    const stressId = nextStressTaskId();
    expect(taskId).not.toBe(stressId);
    // Stress IDs start with 'ts', task IDs with 't' followed by digit
    expect(stressId.startsWith('ts')).toBe(true);
  });
});
