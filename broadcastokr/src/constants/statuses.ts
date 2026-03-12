import type { TaskStatus } from '../types';

export const STATUS_FLOW: TaskStatus[] = ['backlog', 'todo', 'in_progress', 'review', 'done'];

export const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: 'Backlog',
  todo: 'To Do',
  in_progress: 'In Progress',
  review: 'In Review',
  done: 'Done',
};

export const STATUS_COLORS: Record<TaskStatus, string> = {
  backlog: '#94a3b8',
  todo: '#3b82f6',
  in_progress: '#f59e0b',
  review: '#8b5cf6',
  done: '#10b981',
};
