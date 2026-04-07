'use client';
import { useEffect, useState } from 'react';

const shell = {
  width: '100%',
  maxWidth: 1320,
  maxHeight: '92vh',
  overflow: 'hidden',
  background: '#0d0d14',
  border: '1px solid rgba(233,123,44,0.35)',
  borderRadius: 6,
  display: 'flex',
  flexDirection: 'column',
};

const panel = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 6,
  padding: 14,
};

const inputStyle = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 4,
  color: '#e2e2e8',
  padding: '8px 10px',
  fontSize: 12,
  outline: 'none',
};

function formatIdLabel(value, fallback) {
  if (!value) return fallback;
  return String(value)
    .replace(/^cta_/, '')
    .replace(/^cmp_/, '')
    .replace(/^lpg_/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

function MetricCard({ label, value, detail, color = '#e97b2c' }) {
  return (
    <div style={{ ...panel, minHeight: 112 }}>
      <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 8 }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 11, color: '#8f8f9b', marginTop: 8, lineHeight: 1.6 }}>{detail}</div>
    </div>
  );
}

export default function FunnelDashboardPanel({ onClose }) {
  const [dashboard, setDashboard] = useState(null);
  const [clientId, setClientId] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ entity: 'dashboard' });
      if (clientId.trim()) params.set('client_id', clientId.trim());
      if (campaignId.trim()) params.set('campaign_id', campaignId.trim());
      const res = await fetch(`/api/funnel-records?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load funnel dashboard');
      setDashboard(await res.json());
      setError('');
    } catch (err) {
      setError(err.message);
      setDashboard(null);
    } finally {
      setLoading(false);
    }
  }

  const overview = dashboard?.overview || {};

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }}>
      <div style={shell}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 13, fontWeight: 700, color: '#e97b2c', letterSpacing: '0.1em' }}>FUNNEL OPS</div>
            <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>Landing pages, CTAs, leads, booked-call flow, and pipeline value in one operating view.</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: '1px solid #333', color: '#888', padding: '5px 12px', borderRadius: 3, cursor: 'pointer', fontSize: 11 }}>X</button>
        </div>
        {error && (
          <div style={{ padding: '10px 20px', background: 'rgba(239,68,68,0.08)', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#ef4444', fontSize: 11 }}>
            {error}
          </div>
        )}

        <div style={{ padding: 16, borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input style={inputStyle} placeholder="Filter client ID" value={clientId} onChange={e => setClientId(e.target.value)} />
          <input style={inputStyle} placeholder="Filter campaign ID" value={campaignId} onChange={e => setCampaignId(e.target.value)} />
          <button onClick={load} disabled={loading} style={{ padding: '8px 14px', background: 'rgba(233,123,44,0.15)', border: '1px solid rgba(233,123,44,0.35)', borderRadius: 4, color: '#e97b2c', cursor: loading ? 'wait' : 'pointer', fontSize: 11, fontWeight: 700 }}>
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 12, marginBottom: 18 }}>
            <MetricCard label="Landing Pages" value={overview.landingPages || 0} detail="Tracked destination pages tied to CTA paths." />
            <MetricCard label="Visits" value={overview.visits || 0} detail="Recorded landing-page visits from attribution touches." />
            <MetricCard label="Leads" value={overview.leads || 0} detail={`${overview.visitToLeadRate || 0}% visit-to-lead conversion.`} />
            <MetricCard label="Qualified" value={overview.qualifiedLeads || 0} detail="Leads marked as good-fit or qualified." color="#22d3ee" />
            <MetricCard label="Booked" value={overview.bookedLeads || 0} detail={`${overview.leadToBookedRate || 0}% lead-to-booked rate.`} color="#84cc16" />
            <MetricCard label="Pipeline Value" value={`$${overview.pipelineValue || 0}`} detail={`${overview.leadToWonRate || 0}% lead-to-won rate.`} color="#10b981" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: 16, marginBottom: 16 }}>
            <div style={panel}>
              <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 10 }}>LANDING PAGE PERFORMANCE</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {(dashboard?.byLandingPage || []).length === 0 && <div style={{ fontSize: 12, color: '#666' }}>No landing pages yet.</div>}
                {(dashboard?.byLandingPage || []).map(item => (
                  <div key={item.id} style={{ padding: 12, border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4, display: 'grid', gridTemplateColumns: '1.35fr repeat(4, minmax(0, 1fr))', gap: 12, alignItems: 'center' }}>
                    <div>
                      <div style={{ color: '#fff', fontWeight: 700 }}>{item.name}</div>
                      <div style={{ fontSize: 11, color: '#777', marginTop: 4 }}>{formatIdLabel(item.type, 'Page')} | {formatIdLabel(item.ctaId, 'No CTA')}</div>
                    </div>
                    <div style={{ fontSize: 12, color: '#ddd' }}>{item.visits} visits</div>
                    <div style={{ fontSize: 12, color: '#ddd' }}>{item.leads} leads</div>
                    <div style={{ fontSize: 12, color: '#22d3ee' }}>{item.visitToLeadRate}% CVR</div>
                    <div style={{ fontSize: 12, color: '#10b981' }}>${item.pipelineValue}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={panel}>
              <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 10 }}>CTA QUALITY</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {(dashboard?.byCta || []).length === 0 && <div style={{ fontSize: 12, color: '#666' }}>No CTA-linked leads yet.</div>}
                {(dashboard?.byCta || []).map(item => (
                  <div key={item.ctaId} style={{ padding: 12, border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <div>
                        <div style={{ color: '#fff', fontWeight: 700 }}>{formatIdLabel(item.ctaId, 'Unmapped CTA')}</div>
                        <div style={{ fontSize: 11, color: '#777', marginTop: 4 }}>{item.keyword || 'No keyword'}</div>
                      </div>
                      <div style={{ color: '#e97b2c', fontWeight: 700 }}>{item.leads} leads</div>
                    </div>
                    <div style={{ display: 'flex', gap: 12, marginTop: 10, fontSize: 11, color: '#aaa', flexWrap: 'wrap' }}>
                      <span>{item.qualifiedRate}% qualified</span>
                      <span>{item.bookedRate}% booked</span>
                      <span>{item.wonRate}% won</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={panel}>
              <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 10 }}>CAMPAIGN BREAKDOWN</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {(dashboard?.byCampaign || []).length === 0 && <div style={{ fontSize: 12, color: '#666' }}>No campaign-linked leads yet.</div>}
                {(dashboard?.byCampaign || []).map(item => (
                  <div key={item.campaignId} style={{ padding: 12, border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4, display: 'grid', gridTemplateColumns: '1.2fr repeat(4, minmax(0, 1fr))', gap: 10 }}>
                    <div style={{ color: '#fff', fontWeight: 700 }}>{formatIdLabel(item.campaignId, 'Unmapped Campaign')}</div>
                    <div style={{ fontSize: 12, color: '#ddd' }}>{item.leads} leads</div>
                    <div style={{ fontSize: 12, color: '#22d3ee' }}>{item.bookedRate}% booked</div>
                    <div style={{ fontSize: 12, color: '#84cc16' }}>{item.wonRate}% won</div>
                    <div style={{ fontSize: 12, color: '#10b981' }}>${item.pipelineValue}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={panel}>
              <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 10 }}>RECENT LEADS</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {(dashboard?.recentLeads || []).length === 0 && <div style={{ fontSize: 12, color: '#666' }}>No leads captured yet.</div>}
                {(dashboard?.recentLeads || []).map(item => (
                  <div key={item.id} style={{ padding: 12, border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <div>
                        <div style={{ color: '#fff', fontWeight: 700 }}>{item.name}</div>
                        <div style={{ fontSize: 11, color: '#777', marginTop: 4 }}>{formatIdLabel(item.campaignId, 'No campaign')} | {formatIdLabel(item.ctaId, 'No CTA')}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ color: '#e97b2c', fontSize: 12, fontWeight: 700 }}>{item.status}</div>
                        <div style={{ fontSize: 11, color: '#777', marginTop: 4 }}>Q {item.qualityScore}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
