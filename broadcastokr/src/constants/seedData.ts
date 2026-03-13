import type { Goal, Task, KPI } from '../types';

function futureDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

export function createInitialGoals(): Goal[] {
  return [
    {
      id: 'g1', title: 'Achieve 99.95% playout uptime across all linear channels',
      status: 'on_track', progress: 0.72, owner: 2, channel: 0, period: 'Q1 2026',
      keyResults: [
        { title: 'Zero unplanned off-air incidents > 30s', start: 5, target: 0, current: 1, progress: 0.80, status: 'on_track' },
        { title: 'Failover test success rate \u2265 99%', start: 90, target: 99, current: 97, progress: 0.78, status: 'on_track' },
        { title: 'Mean time to recovery < 45 seconds', start: 120, target: 45, current: 52, progress: 0.91, status: 'on_track' },
      ],
    },
    {
      id: 'g2', title: 'Deliver EPG data with \u2265 98% accuracy to all aggregators',
      status: 'at_risk', progress: 0.55, owner: 5, channel: 2, period: 'Q1 2026',
      keyResults: [
        { title: 'Synopsis completeness \u2265 98%', start: 80, target: 98, current: 91, progress: 0.61, status: 'at_risk' },
        { title: 'EPG delivery deadline misses < 1', start: 5, target: 0, current: 2, progress: 0.60, status: 'at_risk' },
        { title: 'Automated validation coverage \u2265 100%', start: 0, target: 100, current: 45, progress: 0.45, status: 'at_risk' },
      ],
    },
    {
      id: 'g3', title: 'Launch VRT NWS FAST channel by April 1',
      status: 'behind', progress: 0.35, owner: 0, channel: 3, period: 'Q2 2026',
      keyResults: [
        { title: 'Content pipeline delivering 18h/day', start: 0, target: 18, current: 6, progress: 0.33, status: 'behind' },
        { title: 'FAST playout integration tested and signed off', start: 0, target: 100, current: 40, progress: 0.4, status: 'behind' },
        { title: 'EPG feed live on 3 aggregator platforms', start: 0, target: 3, current: 1, progress: 0.33, status: 'behind' },
      ],
    },
    {
      id: 'g4', title: 'Meet AVMSD European works quota (30%) for all channels',
      status: 'on_track', progress: 0.78, owner: 3, channel: 2, period: 'Annual 2026',
      keyResults: [
        { title: 'VRT 1 European works share \u2265 35%', start: 28, target: 35, current: 33, progress: 0.71, status: 'on_track' },
        { title: 'VRT MAX catalogue European works \u2265 32%', start: 25, target: 32, current: 31, progress: 0.86, status: 'on_track' },
      ],
    },
  ];
}

export function createInitialTasks(): Task[] {
  return [
    { id: 't1', title: "Clear rights for 'Undercover' S03 \u2014 VRT 1 prime-time", status: 'in_progress', priority: 'critical', assignee: 4, channel: 0, due: futureDate(5), taskType: 'rights_clearance', subtasks: [{ text: 'Verify license window', done: true }, { text: 'Check holdback vs VRT MAX', done: false }, { text: 'Confirm music rights', done: false }] },
    { id: 't2', title: 'EPG delivery for Week 9 \u2014 all channels', status: 'todo', priority: 'high', assignee: 5, channel: 2, due: futureDate(6), taskType: 'epg_delivery', subtasks: [{ text: 'Validate synopsis completeness', done: false }, { text: 'Check thumbnail aspect ratios', done: false }] },
    { id: 't3', title: "Schedule change: move 'Thuis' repeat to 14:30", status: 'review', priority: 'medium', assignee: 1, channel: 0, due: futureDate(4), taskType: 'schedule_change', subtasks: [{ text: 'Check downstream EPG impact', done: true }, { text: 'Verify no rights conflict', done: true }, { text: 'Update promo schedule', done: false }] },
    { id: 't4', title: 'Playout prep for live sports \u2014 Club Brugge vs Anderlecht', status: 'in_progress', priority: 'critical', assignee: 2, channel: 0, due: futureDate(2), taskType: 'playout_prep', subtasks: [{ text: 'Confirm live feed routing', done: true }, { text: 'Test failover path', done: true }, { text: 'Prepare overrun buffer', done: false }] },
    { id: 't5', title: 'AVMSD Q1 compliance snapshot', status: 'backlog', priority: 'high', assignee: 3, channel: 2, due: futureDate(18), taskType: 'compliance_check', subtasks: [{ text: 'Calculate EU works % per channel', done: false }, { text: 'Verify independent production quota', done: false }] },
    { id: 't6', title: 'QC check: new acquisition batch (12 titles)', status: 'todo', priority: 'medium', assignee: 2, channel: 2, due: futureDate(8), taskType: 'content_qc', subtasks: [{ text: 'Audio loudness (EBU R128)', done: false }, { text: 'Subtitle sync verification', done: false }] },
    { id: 't7', title: 'FAST channel loop schedule \u2014 Week 9', status: 'in_progress', priority: 'high', assignee: 1, channel: 3, due: futureDate(4), taskType: 'schedule_change', subtasks: [{ text: 'Fill 18h content grid', done: true }, { text: 'No repeat within 4h window', done: false }, { text: 'SSAI marker placement', done: false }] },
    { id: 't8', title: "Promo campaign: 'Spring Schedule' launch", status: 'backlog', priority: 'low', assignee: 5, channel: 0, due: futureDate(27), taskType: 'promo', subtasks: [] },
  ];
}

export function createInitialKPIs(): KPI[] {
  return [
    { name: 'Playout Uptime', unit: '%', direction: 'hi', target: 99.95, current: 99.91, trend: [99.82, 99.88, 99.90, 99.87, 99.93, 99.91] },
    { name: 'EPG Accuracy', unit: '%', direction: 'hi', target: 98, current: 94.2, trend: [88, 89.5, 91, 92, 93.5, 94.2] },
    { name: 'Rights Clearance Lead', unit: 'h', direction: 'lo', target: 48, current: 68, trend: [120, 108, 96, 84, 72, 68] },
    { name: 'EU Works Quota', unit: '%', direction: 'hi', target: 30, current: 33, trend: [28, 29, 30, 31, 32, 33] },
    { name: 'Schedule Lock Rate', unit: '%', direction: 'hi', target: 90, current: 62, trend: [40, 44, 48, 52, 58, 62] },
    { name: 'Ad Fill Rate', unit: '%', direction: 'hi', target: 95, current: 91, trend: [85, 87, 88, 89, 90, 91] },
  ];
}
