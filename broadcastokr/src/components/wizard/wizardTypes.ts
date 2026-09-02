import type { DBConnection, TableInfo, ColumnInfo, KPIDefinition } from '../../hooks/useBridge';
import type { LiveKRBatchResult, LiveKRQuery } from '../../utils/liveSync';

/** Which of the two measurement subsystems the user wants to set up. */
export type WizardPath = 'kr' | 'kpi' | 'both';

export type StepId =
  | 'welcome' | 'bridge' | 'connection' | 'client'
  | 'path' | 'goal' | 'kpi' | 'finish';

/** What the wizard has created so far. Steps write as they go, so abandoning
 *  half way leaves real, usable records rather than nothing. */
export interface WizardData {
  path: WizardPath;
  connectionId?: string;
  connectionName?: string;
  clientId?: string;
  goalId?: string;
  goalTitle?: string;
  krValue?: number;
  kpiId?: string;
}

export function emptyWizardData(): WizardData {
  return { path: 'both' };
}

/** Everything a step may need from the bridge, gathered into one prop. */
export interface WizardBridge {
  connected: boolean;
  bridgeRunning: boolean;
  startBridge?: () => Promise<{ ok: boolean; message: string }>;
  testConnection: (conn: Omit<DBConnection, 'id'>) => Promise<{ ok: boolean; message: string }>;
  saveConnection: (conn: DBConnection) => Promise<{ ok: boolean; connection: DBConnection }>;
  getConnections: () => Promise<DBConnection[]>;
  getChannels: (connectionId: string) => Promise<Array<{ id: string; name: string; internalValue?: string; channelKind?: string }>>;
  getTables: (connectionId: string) => Promise<TableInfo[]>;
  getColumns: (connectionId: string, tableName: string) => Promise<ColumnInfo[]>;
  previewQuery: (connectionId: string, sql: string) => Promise<Record<string, unknown>[]>;
  saveKPI: (kpi: KPIDefinition) => Promise<{ ok: boolean; kpi: KPIDefinition }>;
  executeBatch: (queries: LiveKRQuery[]) => Promise<{ results: LiveKRBatchResult[] }>;
}

/** Deployment + role facts that decide which steps apply. The permission
 *  flags mirror what the bridge enforces (POST /api/goals needs canCreate,
 *  POST /api/kpis needs canEdit) so a step is never shown to someone whose
 *  save would 403 at the end of it. */
export interface WizardContext {
  fleet: boolean;
  isOwner: boolean;
  canCreate: boolean;
  canEdit: boolean;
}

/** Common props every step receives from the wizard shell. */
export interface StepProps {
  data: WizardData;
  patch: (p: Partial<WizardData>) => void;
  theme: import('../../types').Theme;
  bridge: WizardBridge;
  context: WizardContext;
  /** Advance programmatically (e.g. a choice card that is also a Next). */
  goNext: () => void;
}
