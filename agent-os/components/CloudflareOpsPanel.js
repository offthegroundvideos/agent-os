'use client';
import { useEffect, useState } from 'react';

function formatTime(value) {
  if (!value) return 'Not yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not yet';
  return date.toLocaleString();
}

function codeBlock(value) {
  return JSON.stringify(value, null, 2);
}

export default function CloudflareOpsPanel({ onClose }) {
  const [loading, setLoading] = useState(true);
  const [viewportWidth, setViewportWidth] = useState(1280);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [promotingId, setPromotingId] = useState('');

  const isMobile = viewportWidth <= 900;
  const isCompact = viewportWidth <= 640;

  const cardStyle = {
    padding: isMobile ? 12 : 14,
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: isMobile ? 10 : 6,
  };

  const codeStyle = {
    margin: 0,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    fontSize: isMobile ? 10 : 11,
    lineHeight: 1.6,
    color: '#dbeafe',
    fontFamily: 'JetBrains Mono, monospace',
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/cloudflare-ingest?limit=12');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load Cloudflare ingest state');
      setData(json);
    } catch (err) {
      setError(err.message || 'Failed to load Cloudflare ingest state');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const updateViewport = () => setViewportWidth(window.innerWidth);
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  const summary = data?.summary || {};
  const viralRecords = data?.viralResearch?.records || [];
  const prospectRecords = data?.leadProspects?.records || [];
  const events = data?.events || [];

  const promoteProspect = async (prospectId) => {
    setPromotingId(prospectId);
    setActionMessage('');
    try {
      const res = await fetch('/api/cloudflare-ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'promoteProspectToClient',
          prospectId,
          setActive: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to promote prospect');
      setActionMessage(`Promoted ${json.client?.name || 'prospect'} into Agent OS clients and set it active.`);
      await load();
    } catch (err) {
      setActionMessage(err.message || 'Failed to promote prospect');
    } finally {
      setPromotingId('');
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.9)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: isMobile ? 10 : 24,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: isMobile ? '100%' : 1380,
          maxHeight: isMobile ? 'calc(100vh - 20px)' : '92vh',
          overflow: 'hidden',
          background: '#0d0d14',
          border: '1px solid rgba(34,211,238,0.35)',
          borderRadius: isMobile ? 12 : 8,
          boxShadow: '0 0 60px rgba(34,211,238,0.08)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            padding: isMobile ? '14px 14px 12px' : '14px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 13, fontWeight: 700, color: '#22d3ee', letterSpacing: '0.1em' }}>
              CLOUDFLARE INGEST OPS
            </div>
            <div style={{ fontSize: 10, color: '#667085', marginTop: 2 }}>
              Incoming viral research and lead-prospect intake from Cloudflare workers.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, width: isMobile ? '100%' : 'auto' }}>
            <button
              onClick={load}
              style={{
                flex: isMobile ? 1 : '0 0 auto',
                background: 'rgba(34,211,238,0.1)',
                border: '1px solid rgba(34,211,238,0.28)',
                color: '#67e8f9',
                padding: '6px 12px',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 11,
              }}
            >
              REFRESH
            </button>
            <button
              onClick={onClose}
              style={{
                flex: isMobile ? 1 : '0 0 auto',
                background: 'transparent',
                border: '1px solid #333',
                color: '#888',
                padding: '6px 12px',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 11,
              }}
            >
              CLOSE
            </button>
          </div>
        </div>

        <div style={{ padding: isMobile ? 12 : 18, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ color: '#89a', fontSize: 12 }}>Loading Cloudflare ingest state...</div>
          ) : error ? (
            <div style={{ color: '#fda4af', fontSize: 12 }}>{error}</div>
          ) : (
            <div style={{ display: 'grid', gap: 18 }}>
              <div style={{ display: 'grid', gridTemplateColumns: isCompact ? '1fr' : isMobile ? '1fr 1fr' : 'repeat(5, minmax(0, 1fr))', gap: 12 }}>
                {[
                  { label: 'Viral Records', value: summary.viralRecords || 0, tone: '#3b82f6' },
                  { label: 'Lead Prospects', value: summary.leadProspects || 0, tone: '#10b981' },
                  { label: 'Recent Events', value: summary.recentEvents || 0, tone: '#22d3ee' },
                  { label: 'Last Viral Intake', value: formatTime(summary.lastViralImportAt), tone: '#f59e0b', isText: true },
                  { label: 'Last Prospect Intake', value: formatTime(summary.lastLeadImportAt), tone: '#a78bfa', isText: true },
                ].map((item) => (
                  <div key={item.label} style={cardStyle}>
                    <div style={{ fontSize: 9, color: '#667085', letterSpacing: '0.12em', marginBottom: 8 }}>{item.label}</div>
                    <div style={{ fontSize: item.isText ? 11 : 24, color: item.tone, fontWeight: 700, lineHeight: 1.4 }}>{item.value}</div>
                  </div>
                ))}
              </div>

              <div style={{ ...cardStyle, background: 'rgba(34,211,238,0.04)', border: '1px solid rgba(34,211,238,0.12)' }}>
                <div style={{ fontSize: 10, color: '#67e8f9', letterSpacing: '0.12em', marginBottom: 8 }}>WORKER TARGET</div>
                <div style={{ fontSize: 12, color: '#d8eff6', marginBottom: 8 }}>
                  Point your Cloudflare Worker to <code>POST /api/cloudflare-ingest</code> with an optional <code>x-ingest-secret</code> header.
                </div>
                <div style={{ fontSize: 11, color: '#8ab4c7', lineHeight: 1.6 }}>
                  Keep viral-content discovery and lead scraping separate. Send normalized <code>recordType: "viral_research"</code> or <code>recordType: "lead_prospect"</code> payloads, and Agent OS will route them into the correct store.
                </div>
                <div style={{ fontSize: 10, color: '#6ea5b8', lineHeight: 1.6, marginTop: 8 }}>
                  Prospect contact details are masked in this view by default so intake remains operator-safe.
                </div>
                {actionMessage && (
                  <div style={{ fontSize: 11, color: '#d9f99d', lineHeight: 1.6, marginTop: 10 }}>
                    {actionMessage}
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.2fr 1fr', gap: 18 }}>
                <div style={{ display: 'grid', gap: 18 }}>
                  <div style={cardStyle}>
                    <div style={{ fontSize: 10, color: '#60a5fa', letterSpacing: '0.12em', marginBottom: 10 }}>RECENT VIRAL IMPORTS</div>
                    <div style={{ display: 'grid', gap: 10 }}>
                      {viralRecords.length ? viralRecords.map((item) => (
                        <div key={item.id} style={{ padding: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: isMobile ? 8 : 4 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexDirection: isCompact ? 'column' : 'row' }}>
                            <div>
                              <div style={{ color: '#f8fafc', fontWeight: 700 }}>{item.topic || item.subject || 'Untitled'}</div>
                              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, wordBreak: 'break-word' }}>
                                {item.platform} | @{item.creatorHandle || 'unknown'} | {item.url || 'no url'}
                              </div>
                            </div>
                            <div style={{ textAlign: isCompact ? 'left' : 'right', fontSize: 11, color: '#7dd3fc' }}>
                              <div>{item.viewCount || 0} views</div>
                              <div>freshness {item.freshnessScore ?? 0}</div>
                            </div>
                          </div>
                          <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 8, lineHeight: 1.6 }}>
                            CTA: {item.cta || 'None'}<br />
                            Imported: {formatTime(item.updatedAt)}
                          </div>
                        </div>
                      )) : (
                        <div style={{ fontSize: 12, color: '#667085' }}>No viral imports yet.</div>
                      )}
                    </div>
                  </div>

                  <div style={cardStyle}>
                    <div style={{ fontSize: 10, color: '#34d399', letterSpacing: '0.12em', marginBottom: 10 }}>RECENT LEAD PROSPECTS</div>
                    <div style={{ display: 'grid', gap: 10 }}>
                      {prospectRecords.length ? prospectRecords.map((item) => (
                        <div key={item.id} style={{ padding: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: isMobile ? 8 : 4 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexDirection: isCompact ? 'column' : 'row' }}>
                            <div>
                              <div style={{ color: '#f8fafc', fontWeight: 700 }}>{item.businessName || 'Unnamed prospect'}</div>
                              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                                {item.niche || 'Unspecified niche'} | {item.geography || 'Unspecified geography'}
                              </div>
                            </div>
                            <div style={{ textAlign: isCompact ? 'left' : 'right', fontSize: 11, color: '#6ee7b7', wordBreak: 'break-word' }}>
                              <div>{item.website || 'No site'}</div>
                              <div>{item.publicEmail || item.publicPhone || 'No contact listed'}</div>
                            </div>
                          </div>
                          <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 8, lineHeight: 1.6 }}>
                            Source: {item.source || 'cloudflare'}<br />
                            Imported: {formatTime(item.updatedAt)}
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isCompact ? 'stretch' : 'center', gap: 10, marginTop: 10, flexWrap: 'wrap', flexDirection: isCompact ? 'column' : 'row' }}>
                            <div style={{ fontSize: 10, color: item.promotedToClientId ? '#93c5fd' : '#6b7280' }}>
                              {item.promotedToClientId ? `Promoted to client ${item.promotedToClientId}` : 'Ready to promote into client onboarding'}
                            </div>
                            <button
                              onClick={() => promoteProspect(item.id)}
                              disabled={!!item.promotedToClientId || promotingId === item.id}
                              style={{
                                padding: '6px 10px',
                                background: item.promotedToClientId ? 'rgba(148,163,184,0.1)' : 'rgba(16,185,129,0.14)',
                                border: item.promotedToClientId ? '1px solid rgba(148,163,184,0.2)' : '1px solid rgba(16,185,129,0.35)',
                                borderRadius: 6,
                                color: item.promotedToClientId ? '#94a3b8' : '#34d399',
                                cursor: item.promotedToClientId ? 'not-allowed' : 'pointer',
                                fontSize: 10,
                                fontWeight: 700,
                                width: isCompact ? '100%' : 'auto',
                              }}
                            >
                              {item.promotedToClientId ? 'PROMOTED' : promotingId === item.id ? 'PROMOTING...' : 'PROMOTE TO CLIENT'}
                            </button>
                          </div>
                        </div>
                      )) : (
                        <div style={{ fontSize: 12, color: '#667085' }}>No lead prospects yet.</div>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gap: 18 }}>
                  <div style={cardStyle}>
                    <div style={{ fontSize: 10, color: '#f59e0b', letterSpacing: '0.12em', marginBottom: 10 }}>INGEST EVENT LOG</div>
                    <div style={{ display: 'grid', gap: 10 }}>
                      {events.length ? events.map((event) => (
                        <div key={event.event_id} style={{ padding: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4 }}>
                          <div style={{ fontSize: 11, color: '#f8fafc', fontWeight: 700 }}>{event.event_name}</div>
                          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4, wordBreak: 'break-word' }}>
                            {event.entity_type} | {event.entity_id}
                          </div>
                          <div style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>
                            {formatTime(event.occurred_at)}
                          </div>
                        </div>
                      )) : (
                        <div style={{ fontSize: 12, color: '#667085' }}>No Cloudflare ingest events yet.</div>
                      )}
                    </div>
                  </div>

                  <div style={cardStyle}>
                    <div style={{ fontSize: 10, color: '#c084fc', letterSpacing: '0.12em', marginBottom: 8 }}>PAYLOAD EXAMPLE | VIRAL RESEARCH</div>
                    <pre style={codeStyle}>{codeBlock(data?.payloadExamples?.viralResearch || {})}</pre>
                  </div>

                  <div style={cardStyle}>
                    <div style={{ fontSize: 10, color: '#a7f3d0', letterSpacing: '0.12em', marginBottom: 8 }}>PAYLOAD EXAMPLE | LEAD PROSPECT</div>
                    <pre style={codeStyle}>{codeBlock(data?.payloadExamples?.leadProspect || {})}</pre>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
