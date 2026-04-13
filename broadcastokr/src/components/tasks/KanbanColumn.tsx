import { memo } from 'react';
import { TaskCard } from './TaskCard';
import type { Task, Theme } from '../../types';

interface KanbanColumnProps {
  status: string;
  label: string;
  color: string;
  tasks: Task[];
  theme: Theme;
  dark: boolean;
  onTaskClick: (taskId: string) => void;
}

export const KanbanColumn = memo(function KanbanColumn({ status, label, color, tasks, theme, dark, onTaskClick }: KanbanColumnProps) {
  return (
    <div key={status} style={{ minHeight: 200 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>{label}</span>
        <span style={{ fontSize: 11, color: theme.textFaint, marginLeft: 'auto' }}>{tasks.length}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {tasks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 12px', color: theme.textFaint, fontSize: 12 }}>No tasks</div>
        ) : (
          tasks.map((task) => (
            <TaskCard key={task.id} task={task} theme={theme} dark={dark} onClick={() => onTaskClick(task.id)} />
          ))
        )}
      </div>
    </div>
  );
});
