import { describe, it, expect } from 'vitest';
import { activeSteps } from '../wizardSteps';
import { emptyWizardData, type WizardContext, type WizardData } from '../wizardTypes';

const ids = (ctx: WizardContext, data: WizardData) =>
  activeSteps(ctx, data).map((s) => s.id);

describe('wizard step registry', () => {
  const owner: WizardContext = { fleet: true, isOwner: true, canCreate: true, canEdit: true };
  const manager: WizardContext = { fleet: true, isOwner: false, canCreate: true, canEdit: true };
  const member: WizardContext = { fleet: true, isOwner: false, canCreate: false, canEdit: false };

  it('gives a fleet owner the full run', () => {
    expect(ids(owner, emptyWizardData())).toEqual([
      'welcome', 'bridge', 'connection', 'client', 'path', 'goal', 'kpi', 'finish',
    ]);
  });

  it('drops credential steps for non-owners rather than letting them 403', () => {
    // The bridge gates connections and clients as ownerOnly, so showing these
    // to a member would mean filling in a form that cannot possibly save.
    const steps = ids(manager, emptyWizardData());
    expect(steps).not.toContain('connection');
    expect(steps).not.toContain('client');
    expect(steps).toContain('path');
    expect(steps).toContain('goal');
    expect(steps).toContain('kpi');
    expect(steps).toContain('finish');
  });

  it('drops the writing steps a member cannot complete (goal needs canCreate, KPI needs canEdit)', () => {
    // Review 2026-09-02 F6: these used to apply to every role and then fail
    // at the bridge with a 403 and a "kept locally" toast.
    const steps = ids(member, emptyWizardData());
    expect(steps).not.toContain('goal');
    expect(steps).not.toContain('kpi');
    expect(steps).toEqual(['welcome', 'bridge', 'path', 'finish']);
  });

  it('drops the client step in a single-tenant (client-edition) install', () => {
    const steps = ids({ ...owner, fleet: false }, emptyWizardData());
    expect(steps).not.toContain('client');
    expect(steps).toContain('connection');
  });

  it('follows the chosen path for the measurement steps', () => {
    expect(ids(owner, { path: 'kr' })).toContain('goal');
    expect(ids(owner, { path: 'kr' })).not.toContain('kpi');

    expect(ids(owner, { path: 'kpi' })).toContain('kpi');
    expect(ids(owner, { path: 'kpi' })).not.toContain('goal');

    const both = ids(owner, { path: 'both' });
    expect(both).toContain('goal');
    expect(both).toContain('kpi');
  });

  it('keeps every writing step optional so nobody gets trapped', () => {
    // A user who only wants the tour must be able to reach the end.
    const writing = activeSteps(owner, emptyWizardData())
      .filter((s) => s.canAdvance !== undefined);
    expect(writing.length).toBeGreaterThan(0);
    expect(writing.every((s) => s.optional)).toBe(true);
  });

  it('blocks advancing past a writing step until it has actually written', () => {
    const connection = activeSteps(owner, emptyWizardData()).find((s) => s.id === 'connection')!;
    expect(connection.canAdvance!({ path: 'both' })).toBe(false);
    expect(connection.canAdvance!({ path: 'both', connectionId: 'conn_1' })).toBe(true);
  });
});
