import { useState, useEffect } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useDeployment } from '../../context/DeploymentContext';
import { FLEET_IN_BUILD } from '../../editions/entitlements';
import { bridgeFetch } from '../../store/bridgeSync';
import { formatTimeAgo } from '../../utils/dates';
import { COLOR_SUCCESS, COLOR_WARNING, COLOR_DANGER, FONT_HEADING, FONT_MONO, PRIMARY_COLOR } from '../../constants/config';

interface TenantMetrics {
  tenantId: string;
  tenantName: string;
  color: string;
  metrics: Array<{
    krId: string;
    value: number;
    target: number;
    direction: 'hi' | 'lo';
    timestamp: string;
    receivedAt: string;
  }>;
}

const STALE_MS = 60 * 60 * 1000;

function metricColor(m: TenantMetrics['metrics'][number]): string {
  const good = m.direction === 'hi' ? m.value >= m.target : m.value <= m.target;
  return good ? COLOR_SUCCESS : COLOR_DANGER;
}

/**
 * Cockpit-only: the fleet board's first surface — every tenant's opted-in
 * metrics, latest value vs target, with staleness. Renders nothing outside
 * cockpit mode; self-contained (no prop drilling).
 */
export function FleetMetricsPanel({ connected = false }: { connected?: boolean }) {
  const { theme } = useTheme();
  const { mode } = useDeployment();
  const [fleet, setFleet] = useState<TenantMetrics[]>([]);

  useEffect(() => {
    if (mode !== 'cockpit' || !connected) return;
    let cancelled = false;
    const load = () => bridgeFetch<TenantMetrics[]>('/api/cockpit/metrics', undefined, { retries: 0 })
      .then((data) => { if (!cancelled) setFleet(data); })
      .catch(() => {});
    load();
    const timer = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [mode, connected]);

  if (mode !== 'cockpit') return null;

  return (
    <div style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 12, padding: '18px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
        <span style={{ fontFamily: FONT_HEADING, fontWeight: 700, fontSize: 15, color: theme.text }}>
          🛰️ Fleet metrics
        </span>
        <span style={{ fontSize: 11, color: theme.textMuted }}>
          opt-in values pushed by tenant instances
        </span>
        {/* Build-time gate (FF-1): the route literal must not reach client bundles */}
        {FLEET_IN_BUILD && (
          <a href="#/compare" style={{ marginLeft: 'auto', fontSize: 11, color: PRIMARY_COLOR, fontWeight: 600, textDecoration: 'none' }}>
            Open the fleet board →
          </a>
        )}
      </div>

      {fleet.length === 0 ? (
        <div style={{ color: theme.textMuted, fontSize: 13 }}>
          No tenant has shared metrics yet — mint a share token per tenant and configure their instance.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {fleet.map((tenant) => (
            <div key={tenant.tenantId}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: tenant.color }} />
                <span style={{ fontWeight: 700, fontSize: 13, color: theme.text }}>{tenant.tenantName}</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {tenant.metrics.map((m) => {
                  const stale = Date.now() - new Date(m.timestamp).getTime() > STALE_MS;
                  return (
                    <div
                      key={m.krId}
                      title={`${m.krId} · updated ${formatTimeAgo(m.timestamp)}`}
                      style={{
                        padding: '6px 12px', borderRadius: 8,
                        border: `1px solid ${stale ? COLOR_WARNING + '66' : theme.border}`,
                        fontFamily: FONT_MONO, fontSize: 12,
                      }}
                    >
                      <span style={{ color: metricColor(m), fontWeight: 700 }}>{m.value}</span>
                      <span style={{ color: theme.textMuted }}> / {m.target} {m.direction === 'lo' ? '↓' : '↑'}</span>
                      {stale && <span style={{ color: COLOR_WARNING }}> · stale</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
