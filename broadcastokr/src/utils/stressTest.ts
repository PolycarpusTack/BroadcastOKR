import type { Task, TaskStatus, Priority } from '../types';
import { STATUS_FLOW } from '../constants/statuses';
import { TASK_TYPES } from '../constants/taskTypes';
import { nextStressTaskId } from './ids';

const STRESS_TITLES = [
  'Verify catch-up rights for weekend film', 'EPG feed QA for FAST channel',
  'Schedule promo interstitials', 'Loudness compliance check batch',
  'Subtitle QC for acquired drama', 'Traffic log reconciliation',
  'Playout failover drill', 'Rights renewal: sports package',
  'EPG thumbnail audit', 'FAST loop freshness check',
  'Ad break timing verification', 'Programme metadata enrichment',
  'Compliance report preparation', 'Channel rebrand asset check',
  'Live event backup routing test', 'VOD catalogue rights sweep',
  'Regional opt-out verification', 'Music cue sheet generation',
  'As-run log discrepancy review', 'Content watermark verification',
  'Emergency schedule contingency', 'Simulcast sync validation',
  'Archive migration QC batch', 'Parental rating audit',
  'Caption file format conversion', 'Broadcast clock template update',
  'Commercial break structure review', 'Signal monitoring alert review',
  'Redundancy path verification', 'Content delivery SLA check',
];

function randEl<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function generateStressTasks(count: number): Task[] {
  const priorities: Priority[] = ['critical', 'high', 'medium', 'low'];
  const tasks: Task[] = [];

  for (let i = 0; i < count; i++) {
    const d = new Date();
    d.setDate(d.getDate() + randInt(-3, 30));
    const title = STRESS_TITLES[i % STRESS_TITLES.length] +
      (i >= STRESS_TITLES.length ? ` #${Math.ceil(i / STRESS_TITLES.length)}` : '');

    tasks.push({
      id: nextStressTaskId(),
      title,
      status: randEl(STATUS_FLOW) as TaskStatus,
      priority: randEl(priorities),
      assignee: randInt(0, 5),
      channel: randInt(0, 3),
      due: d.toISOString().slice(0, 10),
      taskType: randEl(TASK_TYPES).key,
      subtasks: Array.from({ length: randInt(0, 4) }, (_, j) => ({
        text: `Subtask ${j + 1}`,
        done: Math.random() > 0.5,
      })),
    });
  }

  return tasks;
}
