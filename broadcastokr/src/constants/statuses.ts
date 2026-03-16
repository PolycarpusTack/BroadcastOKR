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
  backlog: '#5E6F8A',
  todo: '#60A5FA',
  in_progress: '#F59E0B',
  review: '#A78BFA',
  done: '#2DD4BF',
};
