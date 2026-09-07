import type { TaskType } from '../types';

export const TASK_TYPES: TaskType[] = [
  { key: 'schedule_change', label: 'Schedule Change', color: '#3b82f6', icon: '\u{1F4C5}' },
  { key: 'rights_clearance', label: 'Rights Clearance', color: '#8b5cf6', icon: '\u{1F4DC}' },
  { key: 'epg_delivery', label: 'EPG Delivery', color: '#06b6d4', icon: '\u{1F4E1}' },
  { key: 'playout_prep', label: 'Playout Prep', color: '#f59e0b', icon: '\u{1F3AC}' },
  { key: 'compliance_check', label: 'Compliance Check', color: '#ef4444', icon: '\u2696\uFE0F' },
  { key: 'content_qc', label: 'Content QC', color: '#10b981', icon: '\u2705' },
  { key: 'promo', label: 'Promo', color: '#ec4899', icon: '\u{1F4E3}' },
];
