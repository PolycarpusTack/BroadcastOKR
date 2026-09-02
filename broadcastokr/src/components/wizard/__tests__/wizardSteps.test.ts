import { describe, it, expect } from 'vitest';
import { activeSteps } from '../wizardSteps';
import { emptyWizardData, type WizardData } from '../wizardTypes';

const ids = (ctx: { fleet: boolean; isOwner: boolean }, data: WizardData) =>
  activeSteps(ctx, data).map((s) => s.id);

describe('wizard step registry', () => {
  const owner = { fleet: true, isOwner: true };

  it('gives a fleet owner the full run', () => {
    expect(ids(owner, emptyWizardData())).toEqual([
      'welcome', 'bridge', 'connection', 'client', 'path', 'goal', 'kpi', 'finish',
    ]);
  });

  it('drops credential steps for non-owners rather than letting them 403', () => {
    // The bridge gates connections and clients as ownerOnly, so showing these
    // to a member would mean filling in a form that cannot possibly save.
    const steps = ids({ fleet: true, isOwner: false }, emptyWizardData());
    expect(steps).not.toContain('connection');
    expect(steps).not.toContain('client');
    expect(steps).toContain('path');
    expect(steps).toContain('finish');
  });

  it('drops the client step in a single-tenant (client-edition) install', () => {
    const steps = ids({ fleet: false, isOwner: true }, emptyWizardData());
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
