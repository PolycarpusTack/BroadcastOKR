import type { StepId, WizardContext, WizardData } from './wizardTypes';

export interface StepDef {
  id: StepId;
  title: string;
  icon: string;
  /** Does this step exist in this deployment / for this role? */
  applies: (ctx: WizardContext, data: WizardData) => boolean;
  /** Can the user move on? Undefined means "always". */
  canAdvance?: (data: WizardData) => boolean;
  /** Optional steps offer Skip; the wizard never traps someone. */
  optional?: boolean;
}

/**
 * The step registry. Which steps exist is a function of the deployment, not a
 * hardcoded list: a client-edition install has no fleet of clients to set up,
 * and a non-owner cannot store credentials at all (the bridge enforces that —
 * see POLICY in bridge/middleware/rbac.cjs), so those steps drop out rather
 * than being shown and then failing.
 *
 * Everything that writes is optional. Someone who only wants the tour should
 * be able to reach the end, and someone who abandons half way keeps whatever
 * was created up to that point.
 */
export const WIZARD_STEPS: StepDef[] = [
  {
    id: 'welcome',
    title: 'Welcome',
    icon: '\u{1F44B}',
    applies: () => true,
  },
  {
    id: 'bridge',
    title: 'Bridge',
    icon: '\u{1F50C}',
    applies: () => true,
  },
  {
    id: 'connection',
    title: 'Database',
    icon: '\u{1F5C4}️',
    // Storing credentials is owner-only; showing this to a member would just
    // produce a 403 at the end of a form they filled in.
    applies: (ctx) => ctx.isOwner,
    canAdvance: (data) => !!data.connectionId,
    optional: true,
  },
  {
    id: 'client',
    title: 'Client',
    icon: '\u{1F3E2}',
    applies: (ctx) => ctx.fleet && ctx.isOwner,
    canAdvance: (data) => !!data.clientId,
    optional: true,
  },
  {
    id: 'path',
    title: 'What to measure',
    icon: '\u{1F9ED}',
    applies: () => true,
  },
  {
    id: 'goal',
    title: 'First goal',
    icon: '\u{1F3AF}',
    applies: (ctx, data) => ctx.canCreate && (data.path === 'kr' || data.path === 'both'),
    canAdvance: (data) => !!data.goalId,
    optional: true,
  },
  {
    id: 'kpi',
    title: 'Dashboard KPI',
    icon: '\u{1F4C8}',
    applies: (ctx, data) => ctx.canEdit && (data.path === 'kpi' || data.path === 'both'),
    canAdvance: (data) => !!data.kpiId,
    optional: true,
  },
  {
    id: 'finish',
    title: 'Done',
    icon: '✅',
    applies: () => true,
  },
];

/** The steps that actually apply right now, in order. */
export function activeSteps(ctx: WizardContext, data: WizardData): StepDef[] {
  return WIZARD_STEPS.filter((step) => step.applies(ctx, data));
}
