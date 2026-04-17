'use client';

import { useEffect, useState } from 'react';

export default function WorkingMemoryPanel({
  endpoint = '/api/working-memory',
  title = 'WORKING MEMORY',
  accent = '#22d3ee',
  compact = false,
  refreshKey = '',
}) {
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [collapsed, setCollapsed] = useState(false);

  async function loadMemory(forceRefresh = false) {
    try {
      forceRefresh ? setRefreshing(true) : setLoading(true);
      const response = await fetch(`${endpoint}${forceRefresh ? '?refresh=true' : ''}`, { cache: 'no-store' });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || 'Failed to load working memory.');
      }
      setSnapshot(json.workingMemory || null);
      setError(null);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const response = await fetch(endpoint, { cache: 'no-store' });
        const json = await response.json();
        if (cancelled) return;
        if (!response.ok) throw new Error(json.error || 'Failed to load working memory.');
        setSnapshot(json.workingMemory || null);
        setError(null);
      } catch (loadError) {
        if (!cancelled) setError(loadError.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    bootstrap();
    const intervalId = window.setInterval(() => {
      if (!cancelled) loadMemory(false);
    }, 20000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [endpoint]);

  useEffect(() => {
    setCollapsed(Boolean(compact));
  }, [compact]);

  useEffect(() => {
    if (!refreshKey) return;
    loadMemory(true);
  }, [refreshKey]);

  const statRows = snapshot
    ? [
        snapshot.app === 'agent-os'
          ? { label: 'Active client', value: snapshot.activeClient?.business_name || snapshot.activeClient?.name || 'None' }
          : { label: 'Latest project', value: snapshot.projects?.latest?.title || 'None' },
        snapshot.app === 'agent-os'
          ? { label: 'Running', value: String(snapshot.processes?.runningCount ?? 0) }
          : { label: 'Projects', value: String(snapshot.projects?.total ?? 0) },
        snapshot.app === 'agent-os'
          ? { label: 'Publish jobs', value: String(snapshot.publishing?.total ?? 0) }
          : { label: 'Assets', value: String(snapshot.assets?.total ?? 0) },
      ]
    : [];

  const nextActions = Array.isArray(snapshot?.nextActions) ? snapshot.nextActions.slice(0, compact ? 2 : 4) : [];
  const collapsedClientSummary = snapshot?.app === 'agent-os'
    ? {
        name: snapshot.activeClient?.business_name || snapshot.activeClient?.name || 'No active client',
        niche: snapshot.activeClient?.niche || '',
        primaryGoal: snapshot.activeClient?.onboarding_packet?.campaignGoal || '',
        primaryOffer: snapshot.activeClient?.primary_offer || snapshot.activeClient?.onboarding_packet?.offerName || '',
        geography: snapshot.activeClient?.service_area || [snapshot.activeClient?.city, snapshot.activeClient?.state].filter(Boolean).join(', '),
      }
    : {
        name: snapshot?.projects?.latest?.title || 'No active project',
        niche: '',
        primaryGoal: '',
        primaryOffer: '',
        geography: '',
      };

  return (
    <section
      style={{
        padding: compact ? '14px 16px' : '18px 20px',
        borderRadius: 18,
        border: `1px solid ${accent}33`,
        background: `radial-gradient(circle at top left, ${accent}1f, transparent 34%), linear-gradient(180deg, rgba(10,14,22,0.96), rgba(9,11,18,0.92))`,
        boxShadow: '0 22px 48px rgba(0,0,0,0.28)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: collapsed ? 10 : 14, flexWrap: 'wrap' }}>
        <div>
          {collapsed ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 10, color: accent, letterSpacing: '0.14em' }}>{title}</div>
              <div style={{ fontSize: 11, color: '#778099' }}>
                {snapshot?.generatedAt ? `Updated ${new Date(snapshot.generatedAt).toLocaleString()}` : 'Live system snapshot'}
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 10, color: accent, letterSpacing: '0.14em' }}>{title}</div>
              <div style={{ fontSize: 11, color: '#778099', marginTop: 6 }}>
                {snapshot?.generatedAt ? `Updated ${new Date(snapshot.generatedAt).toLocaleString()}` : 'Live system snapshot'}
              </div>
            </>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setCollapsed((prev) => !prev)}
            style={{
              minHeight: 38,
              padding: '0 14px',
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.04)',
              color: '#c9d2ea',
              cursor: 'pointer',
              fontFamily: 'Orbitron, sans-serif',
              fontSize: 10,
              letterSpacing: '0.1em',
            }}
          >
            {collapsed ? 'EXPAND' : 'COLLAPSE'}
          </button>
          <button
            type="button"
            onClick={() => loadMemory(true)}
            disabled={refreshing}
            style={{
              minHeight: 38,
              padding: '0 14px',
              borderRadius: 999,
              border: `1px solid ${accent}55`,
              background: `${accent}18`,
              color: accent,
              cursor: refreshing ? 'wait' : 'pointer',
              fontFamily: 'Orbitron, sans-serif',
              fontSize: 10,
              letterSpacing: '0.1em',
            }}
          >
            {refreshing ? 'REFRESHING' : 'REFRESH'}
          </button>
        </div>
      </div>

      {collapsed ? (
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ fontSize: 12, color: '#e6edf8', lineHeight: 1.5 }}>
            {collapsedClientSummary.name}
          </div>
          {snapshot?.app === 'agent-os' ? (
            <div style={{ fontSize: 11, color: '#9fb0c9', lineHeight: 1.7 }}>
              <span style={{ fontWeight: 700, color: '#c9d2ea' }}>Niche:</span>{' '}
              {collapsedClientSummary.niche || 'Not set'}
              {collapsedClientSummary.primaryGoal ? (
                <>
                  {' '}• <span style={{ fontWeight: 700, color: '#c9d2ea' }}>Goal:</span>{' '}
                  {collapsedClientSummary.primaryGoal}
                </>
              ) : null}
              {collapsedClientSummary.primaryOffer ? (
                <>
                  {' '}• <span style={{ fontWeight: 700, color: '#c9d2ea' }}>Offer:</span>{' '}
                  {collapsedClientSummary.primaryOffer}
                </>
              ) : null}
              {collapsedClientSummary.geography ? (
                <>
                  {' '}• <span style={{ fontWeight: 700, color: '#c9d2ea' }}>Geography:</span>{' '}
                  {collapsedClientSummary.geography}
                </>
              ) : null}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: '#9fb0c9', lineHeight: 1.7 }}>
              Snapshot collapsed. Expand for the full project view.
            </div>
          )}
        </div>
      ) : loading ? (
        <div style={{ fontSize: 12, color: '#c9d2ea' }}>Loading working memory...</div>
      ) : error ? (
        <div style={{ fontSize: 12, color: '#fca5a5', lineHeight: 1.6 }}>{error}</div>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {snapshot?.app === 'agent-os' && snapshot?.activeClient ? (
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 14,
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.03)',
              }}
            >
              <div style={{ fontSize: 10, color: '#7dd3fc', letterSpacing: '0.12em', fontFamily: 'Orbitron, sans-serif', marginBottom: 8 }}>
                CLIENT BRIEF
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 9, color: '#6d7892', letterSpacing: '0.14em', marginBottom: 6 }}>NICHE</div>
                  <div style={{ fontSize: 12, color: '#e6edf8', lineHeight: 1.5 }}>{snapshot.activeClient.niche || 'Not set'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: '#6d7892', letterSpacing: '0.14em', marginBottom: 6 }}>PRIMARY GOAL</div>
                  <div style={{ fontSize: 12, color: '#e6edf8', lineHeight: 1.5 }}>
                    {snapshot.activeClient.onboarding_packet?.campaignGoal || 'Not set'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: '#6d7892', letterSpacing: '0.14em', marginBottom: 6 }}>PRIMARY OFFER</div>
                  <div style={{ fontSize: 12, color: '#e6edf8', lineHeight: 1.5 }}>
                    {snapshot.activeClient.primary_offer || snapshot.activeClient.onboarding_packet?.offerName || 'Not set'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: '#6d7892', letterSpacing: '0.14em', marginBottom: 6 }}>GEOGRAPHY</div>
                  <div style={{ fontSize: 12, color: '#e6edf8', lineHeight: 1.5 }}>
                    {snapshot.activeClient.service_area || [snapshot.activeClient.city, snapshot.activeClient.state].filter(Boolean).join(', ') || 'Not set'}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            {statRows.map((row) => (
              <div
                key={row.label}
                style={{
                  padding: '12px 14px',
                  borderRadius: 14,
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.03)',
                }}
              >
                <div style={{ fontSize: 9, color: '#6d7892', letterSpacing: '0.14em', marginBottom: 6 }}>{row.label.toUpperCase()}</div>
                <div style={{ fontSize: 12, color: '#e6edf8', lineHeight: 1.5 }}>{row.value}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ fontSize: 10, color: '#7dd3fc', letterSpacing: '0.12em', fontFamily: 'Orbitron, sans-serif' }}>NEXT ACTIONS</div>
            {nextActions.length ? (
              nextActions.map((action) => (
                <div
                  key={action}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 12,
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(255,255,255,0.03)',
                    color: '#d6deee',
                    fontSize: 12,
                    lineHeight: 1.55,
                  }}
                >
                  {action}
                </div>
              ))
            ) : (
              <div style={{ fontSize: 12, color: '#98a3bb' }}>No active next actions right now.</div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
