import * as XLSX from 'xlsx';
import { CHANNELS, USERS } from '../constants';
import { nextGoalId, nextTaskId } from './ids';
import type { Goal, Task, KPI, KeyResult, TaskStatus, Priority, Client, GoalTemplate } from '../types';
import { goalStatus } from './colors';
import { migrateKRIds } from '../store/migration';

/* ─── Helpers ─── */

function findChannelIndex(name: string): number {
  if (!name) return 0;
  const lower = name.toLowerCase().trim();
  const idx = CHANNELS.findIndex((ch) => ch.name.toLowerCase() === lower);
  return idx >= 0 ? idx : 0;
}

function findUserIndex(name: string): number {
  if (!name) return 0;
  const lower = name.toLowerCase().trim();
  const idx = USERS.findIndex((u) => u.name.toLowerCase() === lower);
  if (idx >= 0) return idx;
  // partial match (first or last name)
  const partial = USERS.findIndex((u) => u.name.toLowerCase().includes(lower));
  return partial >= 0 ? partial : 0;
}

const VALID_PRIORITIES: Priority[] = ['critical', 'high', 'medium', 'low'];
function parsePriority(val: string): Priority {
  const lower = (val || '').toLowerCase().trim();
  if (VALID_PRIORITIES.includes(lower as Priority)) return lower as Priority;
  return 'medium';
}

const VALID_STATUSES: TaskStatus[] = ['backlog', 'todo', 'in_progress', 'review', 'done'];
function parseTaskStatus(val: string): TaskStatus {
  const lower = (val || '').toLowerCase().trim().replace(/\s+/g, '_');
  if (VALID_STATUSES.includes(lower as TaskStatus)) return lower as TaskStatus;
  return 'todo';
}

function parseNumber(val: unknown, fallback: number = 0): number {
  const n = Number(val);
  return isNaN(n) ? fallback : n;
}

function str(val: unknown): string {
  return val == null ? '' : String(val).trim();
}

/* ─── File Reading ─── */

export interface ParsedData {
  goals: Goal[];
  tasks: Task[];
  kpis: KPI[];
  clients: Client[];
  goalTemplates: GoalTemplate[];
  warnings: string[];
}

export async function parseFile(file: File): Promise<ParsedData> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'json') return parseJSON(file);
  if (ext === 'csv') return parseCSV(file);
  if (ext === 'xlsx' || ext === 'xls') return parseExcel(file);
  throw new Error(`Unsupported file format: .${ext}. Use .xlsx, .csv, or .json`);
}

async function readArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

async function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

/* ─── Excel ─── */

async function parseExcel(file: File): Promise<ParsedData> {
  const buf = await readArrayBuffer(file);
  const wb = XLSX.read(buf, { type: 'array' });
  const warnings: string[] = [];
  let goals: Goal[] = [];
  let tasks: Task[] = [];
  let kpis: KPI[] = [];

  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    if (rows.length === 0) continue;

    const cols = Object.keys(rows[0]).map((k) => k.toLowerCase());
    const lower = name.toLowerCase();

    if (lower.includes('goal') || lower.includes('okr') || lower.includes('objective') || cols.includes('key results') || cols.includes('key_results') || cols.includes('keyresults')) {
      goals = parseGoalRows(rows, warnings);
    } else if (lower.includes('task') || lower.includes('action') || cols.includes('assignee') || cols.includes('due') || cols.includes('priority')) {
      tasks = parseTaskRows(rows, warnings);
    } else if (lower.includes('kpi') || lower.includes('metric') || lower.includes('indicator') || cols.includes('target') && cols.includes('current') && cols.includes('unit')) {
      kpis = parseKPIRows(rows, warnings);
    } else {
      // Auto-detect by columns
      if (cols.includes('key results') || cols.includes('key_results') || cols.includes('keyresults') || cols.includes('owner') && cols.includes('period')) {
        goals = parseGoalRows(rows, warnings);
      } else if (cols.includes('assignee') || cols.includes('due') || cols.includes('due date') || cols.includes('due_date')) {
        tasks = parseTaskRows(rows, warnings);
      } else if (cols.includes('unit') && cols.includes('direction')) {
        kpis = parseKPIRows(rows, warnings);
      } else {
        warnings.push(`Sheet "${name}" was skipped — couldn't detect data type. Name it "Goals", "Tasks", or "KPIs".`);
      }
    }
  }

  if (goals.length === 0 && tasks.length === 0 && kpis.length === 0) {
    warnings.push('No data could be imported. Make sure your sheets are named "Goals", "Tasks", or "KPIs" and have the expected columns.');
  }

  return { goals, tasks, kpis, clients: [], goalTemplates: [], warnings };
}

/* ─── CSV ─── */

async function parseCSV(file: File): Promise<ParsedData> {
  const text = await readText(file);
  const wb = XLSX.read(text, { type: 'string' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  const warnings: string[] = [];

  if (rows.length === 0) {
    return { goals: [], tasks: [], kpis: [], clients: [], goalTemplates: [], warnings: ['CSV file is empty'] };
  }

  const cols = Object.keys(rows[0]).map((k) => k.toLowerCase());
  const nameLower = file.name.toLowerCase();

  // Detect by filename or columns
  if (nameLower.includes('goal') || nameLower.includes('okr') || cols.includes('key results') || cols.includes('key_results') || (cols.includes('owner') && cols.includes('period'))) {
    return { goals: parseGoalRows(rows, warnings), tasks: [], kpis: [], clients: [], goalTemplates: [], warnings };
  }
  if (nameLower.includes('kpi') || nameLower.includes('metric') || (cols.includes('unit') && cols.includes('direction'))) {
    return { goals: [], tasks: [], kpis: parseKPIRows(rows, warnings), clients: [], goalTemplates: [], warnings };
  }
  // Default to tasks
  return { goals: [], tasks: parseTaskRows(rows, warnings), kpis: [], clients: [], goalTemplates: [], warnings };
}

/* ─── JSON ─── */

async function parseJSON(file: File): Promise<ParsedData> {
  const text = await readText(file);
  const data = JSON.parse(text);
  const warnings: string[] = [];

  // Accept { goals: [], tasks: [], kpis: [] } or a plain array
  if (Array.isArray(data)) {
    // Guess type from first item
    const first = data[0];
    if (first && 'keyResults' in first) {
      return { goals: migrateKRIds(data as Goal[]), tasks: [], kpis: [], clients: [], goalTemplates: [], warnings };
    }
    if (first && 'priority' in first && 'assignee' in first) {
      return { goals: [], tasks: data as Task[], kpis: [], clients: [], goalTemplates: [], warnings };
    }
    if (first && 'unit' in first && 'direction' in first) {
      return { goals: [], tasks: [], kpis: data as KPI[], clients: [], goalTemplates: [], warnings };
    }
    warnings.push('Could not detect data type from JSON array');
    return { goals: [], tasks: [], kpis: [], clients: [], goalTemplates: [], warnings };
  }

  const clients: Client[] = Array.isArray(data.clients) ? data.clients : [];
  const goalTemplates: GoalTemplate[] = Array.isArray(data.goalTemplates) ? data.goalTemplates : [];
  const goals: Goal[] = migrateKRIds(Array.isArray(data.goals) ? data.goals : []);

  // Warn about dangling clientIds references
  const clientIdSet = new Set(clients.map((c) => c.id));
  for (const goal of goals) {
    for (const cid of goal.clientIds ?? []) {
      if (!clientIdSet.has(cid)) {
        warnings.push(`Goal "${goal.title}" references unknown clientId "${cid}" — client not found in import data.`);
      }
    }
  }

  return {
    goals,
    tasks: Array.isArray(data.tasks) ? data.tasks : [],
    kpis: Array.isArray(data.kpis) ? data.kpis : [],
    clients,
    goalTemplates,
    warnings,
  };
}

/* ─── Row Parsers ─── */

function col(row: Record<string, unknown>, ...names: string[]): string {
  for (const n of names) {
    for (const key of Object.keys(row)) {
      if (key.toLowerCase().replace(/[\s_-]/g, '') === n.replace(/[\s_-]/g, '')) {
        return str(row[key]);
      }
    }
  }
  return '';
}

function parseGoalRows(rows: Record<string, unknown>[], warnings: string[]): Goal[] {
  const goals: Goal[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const title = col(row, 'title', 'objective', 'goal', 'name');
    if (!title) { warnings.push(`Goals row ${i + 2}: skipped — no title`); continue; }

    const channel = findChannelIndex(col(row, 'channel'));
    const owner = findUserIndex(col(row, 'owner'));
    const period = col(row, 'period', 'quarter', 'timeframe') || 'Q1 2026';
    const progress = parseNumber(col(row, 'progress'), 0);
    const normalizedProgress = progress > 1 ? progress / 100 : progress;

    // Parse key results — can be semicolon-separated or in separate columns
    const krText = col(row, 'keyresults', 'key results', 'key_results', 'krs');
    const keyResults: KeyResult[] = [];

    if (krText) {
      const krParts = krText.split(';').map((s) => s.trim()).filter(Boolean);
      for (const part of krParts) {
        // Format: "KR title | start | target | current" or just "KR title"
        const segments = part.split('|').map((s) => s.trim());
        const krTitle = segments[0] || 'Key Result';
        const start = parseNumber(segments[1], 0);
        const target = parseNumber(segments[2], 100);
        const current = parseNumber(segments[3], start);
        const range = Math.abs(target - start);
        const krProgress = range === 0 ? 0 : Math.min(Math.abs(current - start) / range, 1);
        keyResults.push({
          id: crypto.randomUUID(),
          title: krTitle,
          start,
          target,
          current,
          progress: krProgress,
          status: goalStatus(krProgress),
        });
      }
    }

    if (keyResults.length === 0) {
      // Check for KR1, KR2, KR3 columns
      for (let k = 1; k <= 10; k++) {
        const krTitle = col(row, `kr${k}`, `kr ${k}`, `key result ${k}`, `keyresult${k}`);
        if (!krTitle) break;
        const start = parseNumber(col(row, `kr${k}_start`, `kr${k}start`), 0);
        const target = parseNumber(col(row, `kr${k}_target`, `kr${k}target`), 100);
        const current = parseNumber(col(row, `kr${k}_current`, `kr${k}current`), start);
        const range = Math.abs(target - start);
        const krProgress = range === 0 ? 0 : Math.min(Math.abs(current - start) / range, 1);
        keyResults.push({
          id: crypto.randomUUID(),
          title: krTitle,
          start,
          target,
          current,
          progress: krProgress,
          status: goalStatus(krProgress),
        });
      }
    }

    if (keyResults.length === 0) {
      keyResults.push({ id: crypto.randomUUID(), title: 'Key Result 1', start: 0, target: 100, current: 0, progress: 0, status: 'behind' });
      warnings.push(`Goals row ${i + 2}: no key results found, added default`);
    }

    const avgProgress = keyResults.reduce((s, k) => s + k.progress, 0) / keyResults.length;

    goals.push({
      id: nextGoalId(),
      title,
      status: goalStatus(normalizedProgress || avgProgress),
      progress: normalizedProgress || avgProgress,
      owner,
      channel,
      period,
      keyResults,
    });
  }

  return goals;
}

function parseTaskRows(rows: Record<string, unknown>[], warnings: string[]): Task[] {
  const tasks: Task[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const title = col(row, 'title', 'task', 'name', 'action', 'description');
    if (!title) { warnings.push(`Tasks row ${i + 2}: skipped — no title`); continue; }

    const description = col(row, 'description', 'details', 'notes');
    const channel = findChannelIndex(col(row, 'channel'));
    const assignee = findUserIndex(col(row, 'assignee', 'assigned', 'owner', 'responsible'));
    const priority = parsePriority(col(row, 'priority'));
    const status = parseTaskStatus(col(row, 'status'));
    const taskType = col(row, 'type', 'tasktype', 'task type', 'task_type', 'category') || 'schedule_change';
    const due = col(row, 'due', 'duedate', 'due date', 'due_date', 'deadline');

    // Parse due date — try various formats
    let dueStr = '';
    if (due) {
      const d = new Date(due);
      if (!isNaN(d.getTime())) {
        dueStr = d.toISOString().slice(0, 10);
      } else {
        dueStr = due;
      }
    }
    if (!dueStr) {
      const d = new Date();
      d.setDate(d.getDate() + 14);
      dueStr = d.toISOString().slice(0, 10);
    }

    // Subtasks
    const subtaskText = col(row, 'subtasks', 'checklist', 'sub tasks', 'sub_tasks');
    const subtasks = subtaskText
      ? subtaskText.split(';').map((s) => s.trim()).filter(Boolean).map((text) => ({ text, done: false }))
      : [];

    tasks.push({
      id: nextTaskId(),
      title,
      description: description || undefined,
      status,
      priority,
      assignee,
      channel,
      due: dueStr,
      taskType,
      subtasks,
    });
  }

  return tasks;
}

function parseKPIRows(rows: Record<string, unknown>[], warnings: string[]): KPI[] {
  const kpis: KPI[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const name = col(row, 'name', 'kpi', 'metric', 'indicator');
    if (!name) { warnings.push(`KPIs row ${i + 2}: skipped — no name`); continue; }

    const unit = col(row, 'unit') || '%';
    const direction = col(row, 'direction').toLowerCase() === 'lo' ? 'lo' as const : 'hi' as const;
    const target = parseNumber(col(row, 'target'), 100);
    const current = parseNumber(col(row, 'current', 'value', 'actual'), 0);

    // Trend can be semicolon-separated numbers
    const trendText = col(row, 'trend', 'history', 'data');
    const trend = trendText
      ? trendText.split(';').map((s) => parseNumber(s.trim())).filter((n) => !isNaN(n))
      : [current * 0.7, current * 0.8, current * 0.85, current * 0.9, current * 0.95, current];

    kpis.push({ name, unit, direction, target, current, trend });
  }

  return kpis;
}

/* ─── Export ─── */

export function exportToExcel(goals: Goal[], tasks: Task[], kpis: KPI[], clients: Client[] = [], goalTemplates: GoalTemplate[] = []): void {
  void clients; void goalTemplates; // Excel export omits these — JSON export is the canonical format
  const wb = XLSX.utils.book_new();

  // Goals sheet
  const goalRows = goals.map((g) => ({
    Title: g.title,
    Channel: CHANNELS[g.channel]?.name || '',
    Owner: USERS[g.owner]?.name || '',
    Period: g.period,
    Progress: `${Math.round(g.progress * 100)}%`,
    Status: g.status.replace(/_/g, ' '),
    'Key Results': g.keyResults.map((kr) => {
      const base = `${kr.title} | ${kr.start} | ${kr.target} | ${kr.current}`;
      return kr.liveConfig ? `${base} | LIVE:${kr.liveConfig.connectionId}` : base;
    }).join('; '),
  }));
  if (goalRows.length > 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(goalRows), 'Goals');
  }

  // Tasks sheet
  const taskRows = tasks.map((t) => ({
    Title: t.title,
    Description: t.description || '',
    Status: t.status.replace(/_/g, ' '),
    Priority: t.priority,
    Channel: CHANNELS[t.channel]?.name || '',
    Assignee: USERS[t.assignee]?.name || '',
    'Due Date': t.due,
    Type: t.taskType,
    Subtasks: t.subtasks.map((s) => s.text).join('; '),
  }));
  if (taskRows.length > 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(taskRows), 'Tasks');
  }

  // KPIs sheet
  const kpiRows = kpis.map((k) => ({
    Name: k.name,
    Unit: k.unit,
    Direction: k.direction,
    Target: k.target,
    Current: k.current,
    Trend: k.trend.join('; '),
  }));
  if (kpiRows.length > 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(kpiRows), 'KPIs');
  }

  XLSX.writeFile(wb, `BroadcastOKR_Export_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportToCSV(goals: Goal[], tasks: Task[], kpis: KPI[], type: 'goals' | 'tasks' | 'kpis', clients: Client[] = [], goalTemplates: GoalTemplate[] = []): void {
  void clients; void goalTemplates; // CSV export omits these — JSON export is the canonical format
  const wb = XLSX.utils.book_new();

  if (type === 'goals') {
    const rows = goals.map((g) => ({
      Title: g.title,
      Channel: CHANNELS[g.channel]?.name || '',
      Owner: USERS[g.owner]?.name || '',
      Period: g.period,
      Progress: `${Math.round(g.progress * 100)}%`,
      Status: g.status.replace(/_/g, ' '),
      'Key Results': g.keyResults.map((kr) => {
        const base = `${kr.title} | ${kr.start} | ${kr.target} | ${kr.current}`;
        return kr.liveConfig ? `${base} | LIVE:${kr.liveConfig.connectionId}` : base;
      }).join('; '),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Goals');
    XLSX.writeFile(wb, `BroadcastOKR_Goals_${new Date().toISOString().slice(0, 10)}.csv`, { bookType: 'csv' });
  } else if (type === 'tasks') {
    const rows = tasks.map((t) => ({
      Title: t.title,
      Description: t.description || '',
      Status: t.status.replace(/_/g, ' '),
      Priority: t.priority,
      Channel: CHANNELS[t.channel]?.name || '',
      Assignee: USERS[t.assignee]?.name || '',
      'Due Date': t.due,
      Type: t.taskType,
      Subtasks: t.subtasks.map((s) => s.text).join('; '),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Tasks');
    XLSX.writeFile(wb, `BroadcastOKR_Tasks_${new Date().toISOString().slice(0, 10)}.csv`, { bookType: 'csv' });
  } else {
    const rows = kpis.map((k) => ({
      Name: k.name,
      Unit: k.unit,
      Direction: k.direction,
      Target: k.target,
      Current: k.current,
      Trend: k.trend.join('; '),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'KPIs');
    XLSX.writeFile(wb, `BroadcastOKR_KPIs_${new Date().toISOString().slice(0, 10)}.csv`, { bookType: 'csv' });
  }
}

export function exportToJSON(goals: Goal[], tasks: Task[], kpis: KPI[], clients: Client[] = [], goalTemplates: GoalTemplate[] = []): void {
  const data = { goals, tasks, kpis, clients, goalTemplates };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `BroadcastOKR_Export_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ─── Template Generator ─── */

export function downloadTemplate(): void {
  const wb = XLSX.utils.book_new();

  const goalData = [
    { Title: 'Achieve 99.95% playout uptime', Channel: 'VRT 1', Owner: 'Yannick De Smet', Period: 'Q1 2026', 'Key Results': 'Reduce outage minutes to <5/month | 30 | 5 | 15; Automate failover for 3 feeds | 0 | 3 | 1' },
    { Title: 'Launch VRT MAX kids section', Channel: 'VRT MAX', Owner: 'Lien Verstraete', Period: 'Q2 2026', 'Key Results': 'Curate 200 titles | 0 | 200 | 0; Achieve 50k MAU in first month | 0 | 50000 | 0' },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(goalData), 'Goals');

  const taskData = [
    { Title: 'Clear rights for new drama series', Description: 'Contact distributor for broadcast window', Status: 'todo', Priority: 'high', Channel: 'VRT 1', Assignee: 'Niels Janssen', 'Due Date': '2026-04-15', Type: 'rights_clearance', Subtasks: 'Check contract terms; Contact distributor; Update rights DB' },
    { Title: 'Update EPG metadata for Q2', Description: '', Status: 'backlog', Priority: 'medium', Channel: 'VRT Canvas', Assignee: 'Ava Mertens', 'Due Date': '2026-03-31', Type: 'schedule_change', Subtasks: '' },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(taskData), 'Tasks');

  const kpiData = [
    { Name: 'Playout Uptime', Unit: '%', Direction: 'hi', Target: 99.95, Current: 99.8, Trend: '99.5;99.6;99.7;99.75;99.8' },
    { Name: 'Ad Fill Rate', Unit: '%', Direction: 'hi', Target: 95, Current: 88, Trend: '80;82;85;86;88' },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(kpiData), 'KPIs');

  XLSX.writeFile(wb, 'BroadcastOKR_Template.xlsx');
}
