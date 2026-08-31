import { describe, it, expect, afterEach } from 'vitest';
import { hasFeature, setRuntimeMode, getRuntimeMode, BUILD_EDITION } from '../entitlements';

afterEach(() => setRuntimeMode(BUILD_EDITION));

describe('entitlements', () => {
  it('desktop has everything, client has no fleet or persona, cockpit is fleet without persona', () => {
    expect(hasFeature('fleet', 'desktop')).toBe(true);
    expect(hasFeature('personaPanel', 'desktop')).toBe(true);
    expect(hasFeature('fleet', 'client')).toBe(false);
    expect(hasFeature('personaPanel', 'client')).toBe(false);
    expect(hasFeature('fleet', 'cockpit')).toBe(true);
    expect(hasFeature('personaPanel', 'cockpit')).toBe(false);
  });

  it('runtime mode defaults to the build edition and accepts only valid modes', () => {
    expect(getRuntimeMode()).toBe(BUILD_EDITION);
    setRuntimeMode('client');
    expect(getRuntimeMode()).toBe('client');
    setRuntimeMode('not-a-mode');
    expect(getRuntimeMode()).toBe('client');
  });
});

describe('store fleet gates', () => {
  it('materializeTemplate is a no-op in client mode', async () => {
    const { useStore } = await import('../../store/store');
    useStore.setState({
      goals: [],
      clients: [{ id: 'c1', name: 'VRT', connectionId: 'conn1', color: '#000', channels: [] }],
      goalTemplates: [{
        id: 'tpl1', title: 'T', category: 'Custom', period: 'Q1',
        krTemplates: [{ id: 'krt1', title: 'KR', sql: 'SELECT 1', unit: '#', direction: 'hi', start: 0, target: 10 }],
      }],
    });

    setRuntimeMode('client');
    useStore.getState().materializeTemplate('tpl1', ['c1']);
    expect(useStore.getState().goals).toHaveLength(0);

    setRuntimeMode('desktop');
    useStore.getState().materializeTemplate('tpl1', ['c1']);
    expect(useStore.getState().goals).toHaveLength(1);
  });
});
