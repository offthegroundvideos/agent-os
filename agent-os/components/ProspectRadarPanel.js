'use client';
import { useEffect, useState } from 'react';

const EMPTY_FORM = {
  title: '',
  niche: '',
  requestedService: '',
  sourcePlatform: 'public-web',
  sourceLabel: '',
  sourceUrl: '',
  location: '',
  postedAt: '',
  eventDate: '',
  summary: '',
  outreachAngle: '',
};

function formatTime(value) {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return date.toLocaleString();
}

function badgeColor(status) {
  if (status === 'today') return '#f97316';
  if (status === 'upcoming') return '#10b981';
  if (status === 'fresh') return '#22d3ee';
  if (status === 'recent') return '#60a5fa';
  if (status === 'passed' || status === 'expired') return '#ef4444';
  return '#94a3b8';
}

export default function ProspectRadarPanel({ onClose }) {
  const [viewportWidth, setViewportWidth] = useState(1280);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [data, setData] = useState(null);
  const [searchNiche, setSearchNiche] = useState('wedding photography');
  const [searchLocation, setSearchLocation] = useState('');
  const [searchYear, setSearchYear] = useState('2027');
  const [searchCategory, setSearchCategory] = useState('weddings');
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [actingId, setActingId] = useState('');

  const isMobile = viewportWidth <= 900;
  const isCompact = viewportWidth <= 640;

  const cardStyle = {
    padding: isMobile ? 12 : 14,
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: isMobile ? 10 : 6,
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        limit: '16',
        niche: searchNiche,
        location: searchLocation,
        year: searchYear,
        category: searchCategory,
      });
      const res = await fetch(`/api/prospect-radar?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load Prospect Radar');
      setData(json);
    } catch (err) {
      setError(err.message || 'Failed to load Prospect Radar');
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

  const updateField = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const submitRecord = async () => {
    setSaving(true);
    setActionMessage('');
    try {
      const payload = {
        ...form,
        niche: form.niche || searchNiche,
        sourceLabel: form.sourceLabel || form.sourcePlatform,
      };
      const res = await fetch('/api/prospect-radar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to add opportunity');
      setForm({
        ...EMPTY_FORM,
        niche: searchNiche,
      });
      setActionMessage('Opportunity added to Prospect Radar.');
      await load();
    } catch (err) {
      setActionMessage(err.message || 'Failed to add opportunity');
    } finally {
      setSaving(false);
    }
  };

  const launchDiscovery = async () => {
    setLaunching(true);
    setActionMessage('');
    try {
      const res = await fetch('/api/prospect-radar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'launchDiscovery',
          category: searchCategory,
          niche: searchNiche,
          location: searchLocation,
          year: searchYear,
          limit: 8,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || json.workerResponse?.error || 'Failed to launch discovery');
      setActionMessage(`Discovery launched for ${searchCategory}. Generated ${json.workerResponse?.generatedRecords ?? 0} records.`);
      await load();
    } catch (err) {
      setActionMessage(err.message || 'Failed to launch discovery');
    } finally {
      setLaunching(false);
    }
  };

  const actOnOpportunity = async (action, opportunityId, body = {}) => {
    setActingId(opportunityId);
    setActionMessage('');
    try {
      const res = await fetch('/api/prospect-radar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, opportunityId, ...body }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Action failed');
      setActionMessage(
        action === 'saveAsLeadProspect'
          ? 'Saved this opportunity into the lead prospect queue.'
          : action === 'archive'
            ? 'Opportunity archived.'
            : 'Outreach status updated.'
      );
      await load();
    } catch (err) {
      setActionMessage(err.message || 'Action failed');
    } finally {
      setActingId('');
    }
  };

  const summary = data?.summary || {};
  const records = data?.records || [];
  const templates = data?.templates || [];
  const events = data?.events || [];
  const presets = data?.presets || [];

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
          maxWidth: isMobile ? '100%' : 1440,
          maxHeight: isMobile ? 'calc(100vh - 20px)' : '92vh',
          overflow: 'hidden',
          background: '#0d0d14',
          border: '1px solid rgba(16,185,129,0.35)',
          borderRadius: isMobile ? 12 : 8,
          boxShadow: '0 0 60px rgba(16,185,129,0.08)',
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
            <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 13, fontWeight: 700, color: '#34d399', letterSpacing: '0.1em' }}>
              PROSPECT RADAR
            </div>
            <div style={{ fontSize: 10, color: '#667085', marginTop: 2 }}>
              Public-web opportunity tracking for service-request posts. Use the links manually on platform.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, width: isMobile ? '100%' : 'auto' }}>
            <button
              onClick={load}
              style={{
                flex: isMobile ? 1 : '0 0 auto',
                background: 'rgba(16,185,129,0.1)',
                border: '1px solid rgba(16,185,129,0.28)',
                color: '#86efac',
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
            <div style={{ color: '#89a', fontSize: 12 }}>Loading Prospect Radar...</div>
          ) : error ? (
            <div style={{ color: '#fda4af', fontSize: 12 }}>{error}</div>
          ) : (
            <div style={{ display: 'grid', gap: 18 }}>
              <div style={{ display: 'grid', gridTemplateColumns: isCompact ? '1fr' : isMobile ? '1fr 1fr' : 'repeat(5, minmax(0, 1fr))', gap: 12 }}>
                {[
                  { label: 'Active Requests', value: summary.active || 0, tone: '#10b981' },
                  { label: 'Upcoming Dates', value: summary.upcoming || 0, tone: '#22c55e' },
                  { label: 'Needs Review', value: summary.needsReview || 0, tone: '#22d3ee' },
                  { label: 'Actioned', value: summary.actioned || 0, tone: '#f59e0b' },
                  { label: 'Last Update', value: formatTime(summary.lastUpdated), tone: '#a78bfa', isText: true },
                ].map((item) => (
                  <div key={item.label} style={cardStyle}>
                    <div style={{ fontSize: 9, color: '#667085', letterSpacing: '0.12em', marginBottom: 8 }}>{item.label}</div>
                    <div style={{ fontSize: item.isText ? 11 : 24, color: item.tone, fontWeight: 700, lineHeight: 1.4 }}>{item.value}</div>
                  </div>
                ))}
              </div>

              <div style={{ ...cardStyle, background: 'rgba(16,185,129,0.04)', border: '1px solid rgba(16,185,129,0.12)' }}>
                <div style={{ fontSize: 10, color: '#86efac', letterSpacing: '0.12em', marginBottom: 8 }}>SAFE OPERATING MODE</div>
                <div style={{ fontSize: 12, color: '#d8eff6', lineHeight: 1.7 }}>
                  Use public search results, public pages, and approved APIs. Open the original link manually to comment, message, or invite.
                  Do not automate replies into private Facebook groups or private Nextdoor neighborhoods.
                </div>
                {actionMessage && (
                  <div style={{ fontSize: 11, color: '#d9f99d', lineHeight: 1.6, marginTop: 10 }}>
                    {actionMessage}
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.1fr 1fr', gap: 18 }}>
                <div style={{ display: 'grid', gap: 18 }}>
                  <div style={cardStyle}>
                    <div style={{ fontSize: 10, color: '#34d399', letterSpacing: '0.12em', marginBottom: 10 }}>DISCOVERY SEARCH LINKS</div>
                    <div style={{ display: 'grid', gridTemplateColumns: isCompact ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 10, marginBottom: 12 }}>
                      {[
                        { key: 'niche', label: 'Niche', value: searchNiche },
                        { key: 'location', label: 'Location', value: searchLocation },
                        { key: 'year', label: 'Target Year', value: searchYear },
                        { key: 'category', label: 'Category', value: searchCategory },
                      ].map((field) => (
                        <label key={field.key} style={{ display: 'grid', gap: 6 }}>
                          <span style={{ fontSize: 10, color: '#94a3b8', letterSpacing: '0.08em' }}>{field.label}</span>
                          {field.key === 'category' ? (
                            <select
                              value={field.value}
                              onChange={(e) => setSearchCategory(e.target.value)}
                              style={{
                                width: '100%',
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                color: '#f8fafc',
                                padding: '10px 12px',
                                borderRadius: 8,
                                fontSize: 12,
                              }}
                            >
                              <option value="weddings">Weddings</option>
                              <option value="festivals">Festivals</option>
                              <option value="automotive">Automotive</option>
                              <option value="general">General Services</option>
                            </select>
                          ) : (
                            <input
                              value={field.value}
                              onChange={(e) => {
                                if (field.key === 'niche') setSearchNiche(e.target.value);
                                else if (field.key === 'location') setSearchLocation(e.target.value);
                                else if (field.key === 'year') setSearchYear(e.target.value);
                              }}
                              style={{
                                width: '100%',
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                color: '#f8fafc',
                                padding: '10px 12px',
                                borderRadius: 8,
                                fontSize: 12,
                              }}
                            />
                          )}
                        </label>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                      {presets.map((preset) => (
                        <button
                          key={preset.id}
                          onClick={() => {
                            setSearchCategory(preset.id);
                            setSearchNiche(preset.niche || '');
                            setSearchYear(preset.year || '');
                          }}
                          style={{
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            color: '#d8eff6',
                            padding: '7px 10px',
                            borderRadius: 999,
                            cursor: 'pointer',
                            fontSize: 10,
                            fontWeight: 700,
                          }}
                        >
                          {preset.label.toUpperCase()}
                        </button>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                      <button
                        onClick={load}
                        style={{
                          background: 'rgba(59,130,246,0.12)',
                          border: '1px solid rgba(59,130,246,0.3)',
                          color: '#93c5fd',
                          padding: '8px 12px',
                          borderRadius: 8,
                          cursor: 'pointer',
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        REFRESH LINKS
                      </button>
                      <button
                        onClick={launchDiscovery}
                        disabled={launching}
                        style={{
                          background: 'rgba(16,185,129,0.12)',
                          border: '1px solid rgba(16,185,129,0.32)',
                          color: '#86efac',
                          padding: '8px 12px',
                          borderRadius: 8,
                          cursor: launching ? 'wait' : 'pointer',
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        {launching ? 'LAUNCHING...' : 'LAUNCH DISCOVERY'}
                      </button>
                    </div>
                    <div style={{ display: 'grid', gap: 10 }}>
                      {templates.map((template) => (
                        <div key={template.id} style={{ padding: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: isMobile ? 8 : 4 }}>
                          <div style={{ color: '#f8fafc', fontWeight: 700 }}>{template.label}</div>
                          <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.6, marginTop: 6 }}>{template.note}</div>
                          <div style={{ marginTop: 10 }}>
                            <a
                              href={template.url}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '7px 10px',
                                borderRadius: 8,
                                textDecoration: 'none',
                                background: 'rgba(16,185,129,0.12)',
                                border: '1px solid rgba(16,185,129,0.28)',
                                color: '#86efac',
                                fontSize: 11,
                                fontWeight: 700,
                              }}
                            >
                              OPEN SEARCH
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={cardStyle}>
                    <div style={{ fontSize: 10, color: '#60a5fa', letterSpacing: '0.12em', marginBottom: 10 }}>MANUAL ADD</div>
                    <div style={{ display: 'grid', gridTemplateColumns: isCompact ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                      {[
                        ['title', 'Title'],
                        ['niche', 'Niche'],
                        ['requestedService', 'Requested Service'],
                        ['sourcePlatform', 'Source Platform'],
                        ['sourceLabel', 'Source Label'],
                        ['sourceUrl', 'Source URL'],
                        ['location', 'Location'],
                        ['postedAt', 'Posted At'],
                        ['eventDate', 'Event Date'],
                        ['outreachAngle', 'Outreach Angle'],
                      ].map(([key, label]) => (
                        <label key={key} style={{ display: 'grid', gap: 6, gridColumn: ['title', 'sourceUrl', 'outreachAngle'].includes(key) ? (isCompact ? 'auto' : '1 / -1') : 'auto' }}>
                          <span style={{ fontSize: 10, color: '#94a3b8', letterSpacing: '0.08em' }}>{label}</span>
                          <input
                            value={form[key]}
                            onChange={(e) => updateField(key, e.target.value)}
                            placeholder={label}
                            style={{
                              width: '100%',
                              background: 'rgba(255,255,255,0.03)',
                              border: '1px solid rgba(255,255,255,0.1)',
                              color: '#f8fafc',
                              padding: '10px 12px',
                              borderRadius: 8,
                              fontSize: 12,
                            }}
                          />
                        </label>
                      ))}
                      <label style={{ display: 'grid', gap: 6, gridColumn: isCompact ? 'auto' : '1 / -1' }}>
                        <span style={{ fontSize: 10, color: '#94a3b8', letterSpacing: '0.08em' }}>Summary</span>
                        <textarea
                          value={form.summary}
                          onChange={(e) => updateField('summary', e.target.value)}
                          rows={4}
                          style={{
                            width: '100%',
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            color: '#f8fafc',
                            padding: '10px 12px',
                            borderRadius: 8,
                            fontSize: 12,
                            resize: 'vertical',
                          }}
                        />
                      </label>
                    </div>
                    <div style={{ marginTop: 12 }}>
                      <button
                        onClick={submitRecord}
                        disabled={saving}
                        style={{
                          width: isCompact ? '100%' : 'auto',
                          background: 'rgba(59,130,246,0.12)',
                          border: '1px solid rgba(59,130,246,0.3)',
                          color: '#bfdbfe',
                          padding: '9px 14px',
                          borderRadius: 8,
                          cursor: saving ? 'wait' : 'pointer',
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        {saving ? 'ADDING...' : 'ADD OPPORTUNITY'}
                      </button>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gap: 18 }}>
                  <div style={cardStyle}>
                    <div style={{ fontSize: 10, color: '#f59e0b', letterSpacing: '0.12em', marginBottom: 10 }}>ACTIVE OPPORTUNITIES</div>
                    <div style={{ display: 'grid', gap: 10 }}>
                      {records.length ? records.map((item) => (
                        <div key={item.id} style={{ padding: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: isMobile ? 8 : 4 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexDirection: isCompact ? 'column' : 'row' }}>
                            <div>
                              <div style={{ color: '#f8fafc', fontWeight: 700 }}>{item.title}</div>
                              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, lineHeight: 1.6 }}>
                                {item.requestedService || item.niche} | {item.location || 'Location unknown'} | {item.sourceLabel || item.sourcePlatform}
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: isCompact ? 'flex-start' : 'flex-end' }}>
                              {[
                                { label: item.dateStatus || 'unknown', color: badgeColor(item.dateStatus) },
                                { label: `fit ${item.qualificationScore || 0}`, color: '#22d3ee' },
                                { label: `fresh ${item.freshnessScore || 0}`, color: '#93c5fd' },
                              ].map((badge) => (
                                <span
                                  key={badge.label}
                                  style={{
                                    fontSize: 10,
                                    padding: '4px 7px',
                                    borderRadius: 999,
                                    border: `1px solid ${badge.color}44`,
                                    background: `${badge.color}18`,
                                    color: badge.color,
                                    textTransform: 'uppercase',
                                  }}
                                >
                                  {badge.label}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 8, lineHeight: 1.7 }}>
                            {item.summary || 'No summary captured yet.'}
                          </div>
                          <div style={{ fontSize: 11, color: '#a7f3d0', marginTop: 8, lineHeight: 1.7 }}>
                            Suggested move: {item.recommendedAction || 'Manual review'}
                            {item.outreachAngle ? ` | Angle: ${item.outreachAngle}` : ''}
                          </div>
                          <div style={{ fontSize: 10, color: '#64748b', marginTop: 8, lineHeight: 1.6 }}>
                            Posted: {formatTime(item.postedAt)}{item.eventDate ? ` | Event date: ${formatTime(item.eventDate)}` : ''}
                          </div>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                            <a
                              href={item.directActionUrl || item.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                padding: '7px 10px',
                                borderRadius: 8,
                                textDecoration: 'none',
                                background: 'rgba(16,185,129,0.12)',
                                border: '1px solid rgba(16,185,129,0.28)',
                                color: '#86efac',
                                fontSize: 10,
                                fontWeight: 700,
                              }}
                            >
                              OPEN LINK
                            </a>
                            <button
                              onClick={() => actOnOpportunity('markOutreach', item.id, { outreachStatus: 'actioned' })}
                              disabled={actingId === item.id}
                              style={{
                                padding: '7px 10px',
                                borderRadius: 8,
                                background: 'rgba(59,130,246,0.12)',
                                border: '1px solid rgba(59,130,246,0.28)',
                                color: '#bfdbfe',
                                cursor: 'pointer',
                                fontSize: 10,
                                fontWeight: 700,
                              }}
                            >
                              MARK ACTIONED
                            </button>
                            <button
                              onClick={() => actOnOpportunity('saveAsLeadProspect', item.id)}
                              disabled={actingId === item.id || !!item.promotedLeadId}
                              style={{
                                padding: '7px 10px',
                                borderRadius: 8,
                                background: item.promotedLeadId ? 'rgba(148,163,184,0.12)' : 'rgba(245,158,11,0.12)',
                                border: item.promotedLeadId ? '1px solid rgba(148,163,184,0.24)' : '1px solid rgba(245,158,11,0.28)',
                                color: item.promotedLeadId ? '#94a3b8' : '#fcd34d',
                                cursor: item.promotedLeadId ? 'not-allowed' : 'pointer',
                                fontSize: 10,
                                fontWeight: 700,
                              }}
                            >
                              {item.promotedLeadId ? 'SAVED TO LEADS' : 'SAVE AS LEAD'}
                            </button>
                            <button
                              onClick={() => actOnOpportunity('archive', item.id)}
                              disabled={actingId === item.id}
                              style={{
                                padding: '7px 10px',
                                borderRadius: 8,
                                background: 'rgba(239,68,68,0.1)',
                                border: '1px solid rgba(239,68,68,0.24)',
                                color: '#fca5a5',
                                cursor: 'pointer',
                                fontSize: 10,
                                fontWeight: 700,
                              }}
                            >
                              ARCHIVE
                            </button>
                          </div>
                        </div>
                      )) : (
                        <div style={{ fontSize: 12, color: '#667085' }}>No opportunity posts yet. Use the search links or add one manually.</div>
                      )}
                    </div>
                  </div>

                  <div style={cardStyle}>
                    <div style={{ fontSize: 10, color: '#c084fc', letterSpacing: '0.12em', marginBottom: 10 }}>RECENT EVENTS</div>
                    <div style={{ display: 'grid', gap: 10 }}>
                      {events.length ? events.map((event) => (
                        <div key={event.event_id} style={{ padding: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4 }}>
                          <div style={{ fontSize: 11, color: '#f8fafc', fontWeight: 700 }}>{event.event_name}</div>
                          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>{formatTime(event.occurred_at)}</div>
                        </div>
                      )) : (
                        <div style={{ fontSize: 12, color: '#667085' }}>No Prospect Radar events yet.</div>
                      )}
                    </div>
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
