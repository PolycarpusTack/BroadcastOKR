export type Role = 'owner' | 'manager' | 'member';
export type GoalStatus = 'on_track' | 'at_risk' | 'behind' | 'done';
export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done';
export type Priority = 'critical' | 'high' | 'medium' | 'low';
export type KPIDirection = 'hi' | 'lo';

export interface User {
  id: number;
  name: string;
  role: Role;
  av: string;
  color: string;
  dept: string;
  title: string;
}

export interface Team {
  name: string;
  members: number[];
  color: string;
  icon: string;
}

export interface Channel {
  name: string;
  color: string;
  type: string;
  icon: string;
}

export interface TaskType {
  key: string;
  label: string;
  color: string;
  icon: string;
}

export interface RolePermissions {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canAssign: boolean;
  canCheckIn: boolean;
  canChangeStatus: boolean;
  canViewReports: boolean;
  label: string;
}

/** Sync status for live (database-backed) key results */
export type SyncStatus = 'ok' | 'error' | 'timeout' | 'no_data' | 'stale' | 'pending';

/** Configuration for a live KR linked to a database query */
export interface LiveKRConfig {
  connectionId: string;
  sql: string;
  unit: string;
  direction: 'hi' | 'lo';
  timeframeDays?: number;
}

export interface KeyResult {
  id: string;
  title: string;
  start: number;
  target: number;
  current: number;
  progress: number;
  status: GoalStatus;
  /** If present, this KR is live — synced from a database via the bridge */
  liveConfig?: LiveKRConfig;
  /** Last sync status (only for live KRs) */
  syncStatus?: SyncStatus;
  /** Error message from last sync attempt */
  syncError?: string;
  /** ISO timestamp of last successful sync */
  lastSyncAt?: string;
  krTemplateId?: string;
}

export interface Goal {
  id: string;
  title: string;
  status: GoalStatus;
  progress: number;
  owner: number;
  channel: number;
  period: string;
  keyResults: KeyResult[];
  clientIds?: string[];
  channelScope?: ChannelScope;
  templateId?: string;
}

export interface Subtask {
  text: string;
  done: boolean;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: Priority;
  assignee: number;
  channel: number;
  due: string;
  taskType: string;
  subtasks: Subtask[];
  clientIds?: string[];
  channelScope?: ChannelScope;
  goalId?: string;
}

export interface KPI {
  name: string;
  unit: string;
  direction: KPIDirection;
  target: number;
  current: number;
  trend: number[];
}

export interface Theme {
  bg: string;
  bgCard: string;
  bgCardHover: string;
  bgSidebar: string;
  bgSidebarActive: string;
  bgInput: string;
  bgMuted: string;
  border: string;
  borderLight: string;
  borderInput: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  textFaint: string;
  sidebarText: string;
  sidebarTextActive: string;
  overlay: string;
  headerBg: string;
  compliantBg: string;
  compliantBorder: string;
  atRiskBg: string;
  atRiskBorder: string;
}

export interface Toast {
  id: number;
  text: string;
  bg: string;
  icon: string;
  exiting: boolean;
}

export interface ActivityEntry {
  id: number;
  text: string;
  user: string;
  time: string;
  color: string;
}

export interface PriorityInfo {
  label: string;
  color: string;
  icon: string;
}

export interface UrgencyBadge {
  text: string;
  bg: string;
  fg: string;
  pulse: boolean;
}

export interface KPIStatus {
  label: string;
  color: string;
}

export interface ClientChannel {
  id: string;
  name: string;
  internalValue?: string;
  channelKind?: string;
  color?: string;
}

export type ChannelScope =
  | { type: 'all' }
  | { type: 'selected'; channelIds: string[] };

export interface Client {
  id: string;
  name: string;
  connectionId: string;
  logo?: string;
  color: string;
  tags?: string[];
  channels: ClientChannel[];
  /** templateId → { krTemplateId → custom SQL } */
  sqlOverrides?: Record<string, Record<string, string>>;
}

export interface KRTemplate {
  id: string;
  title: string;
  sql: string;
  unit: string;
  direction: 'hi' | 'lo';
  start: number;
  target: number;
  timeframeDays?: number;
}

export interface GoalTemplate {
  id: string;
  title: string;
  category: string;
  period: string;
  syncIntervalMs?: number;
  krTemplates: KRTemplate[];
}
