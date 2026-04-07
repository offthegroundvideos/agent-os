'use client';
import { useEffect, useMemo, useState } from 'react';

export default function KpiPanel({ onClose }) {
  const [dashboard, setDashboard] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [category, setCategory] = useState('content');
  const [metricId, setMetricId] = useState('posts_published_per_week');
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState('');
  const [period, setPeriod] = useState('');
  const [assetId, setAssetId] = useState('');
  const [notes, setNotes] = useState('');
  const [stageName, setStageName] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');

  useEffect(() => {
    load();
  }, []);

  const definitions = dashboard?.definitions || { content: [], system: [] };
  const metrics = definitions[category] || [];

  useEffect(() => {
    if (metrics.length && !metrics.find(metric => metric.id === metricId)) {
      setMetricId(metrics[0].id);
    }
  }, [category, metricId, metrics]);

  const selectedMetric = useMemo(() => metrics.find(metric => metric.id === metricId), [metrics, metricId]);

  async function load() {
    try {
      const res = await fetch('/api/kpis');
      if (!res.ok) throw new Error('Failed to load KPI dashboard');
      setDashboard(await res.json());
      setError('');
    } catch (err) {
      setError(err.message);
      setDashboard(null);
    }
  }

  async function saveMetric() {
    setSaving(true);
    try {
      const res = await fetch('/api/kpis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'recordMetric',
          category,
          metricId,
          value,
          unit,
          period,
          assetId,
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to save KPI metric');
      setValue('');
      setUnit('');
      setPeriod('');
      setAssetId('');
      setNotes('');
      setError('');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveStageTiming() {
    setSaving(true);
    try {
      const res = await fetch('/api/kpis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'recordStageTiming',
          stageName,
          assetId,
          durationMinutes,
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to save stage timing');
      setStageName('');
      setDurationMinutes('');
      setAssetId('');
      setNotes('');
      setError('');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = {
    width: '100%',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 4,
    color: '#e2e2e8',
    padding: '8px 10px',
    fontSize: 12,
    outline: 'none',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 1240, maxHeight: '92vh', overflow: 'hidden', background: '#0d0d14', border: '1px solid rgba(16,185,129,0.35)', borderRadius: 6, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 13, fontWeight: 700, color: '#10b981', letterSpacing: '0.1em' }}>SUCCESS KPIS</div>
            <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>Track content performance and system efficiency with defined formulas.</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: '1px solid #333', color: '#888', padding: '5px 12px', borderRadius: 3, cursor: 'pointer', fontSize: 11 }}>X</button>
        </div>
        {error && (
          <div style={{
            padding: '10px 20px',
            background: 'rgba(239,68,68,0.08)',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
            color: '#ef4444',
            fontSize: 11,
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', minHeight: 0, flex: 1 }}>
          <div style={{ padding: 16, borderRight: '1px solid rgba(255,255,255,0.06)', overflowY: 'auto' }}>
            <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 8 }}>RECORD METRIC</div>
            <div style={{ display: 'grid', gap: 8, marginBottom: 18 }}>
              <select style={inputStyle} value={category} onChange={e => setCategory(e.target.value)}>
                <option value="content">Content KPIs</option>
                <option value="system">System KPIs</option>
              </select>
              <select style={inputStyle} value={metricId} onChange={e => setMetricId(e.target.value)}>
                {metrics.map(metric => <option key={metric.id} value={metric.id}>{metric.label}</option>)}
              </select>
              {selectedMetric && <div style={{ fontSize: 11, color: '#8fbfae', lineHeight: 1.6 }}>{selectedMetric.description}<br />Formula: {selectedMetric.formula}</div>}
              <input style={inputStyle} placeholder="Value" value={value} onChange={e => setValue(e.target.value)} />
              <input style={inputStyle} placeholder="Unit (seconds, %, minutes, assets)" value={unit} onChange={e => setUnit(e.target.value)} />
              <input style={inputStyle} placeholder="Period (e.g. 2026-W14)" value={period} onChange={e => setPeriod(e.target.value)} />
              <input style={inputStyle} placeholder="Asset ID (optional)" value={assetId} onChange={e => setAssetId(e.target.value)} />
              <textarea style={{ ...inputStyle, minHeight: 70 }} placeholder="Notes" value={notes} onChange={e => setNotes(e.target.value)} />
              <button onClick={saveMetric} disabled={saving || !metricId || value === ''} style={{ padding: '10px 14px', background: 'rgba(16,185,129,0.14)', border: '1px solid rgba(16,185,129,0.35)', borderRadius: 4, color: '#10b981', cursor: saving ? 'wait' : 'pointer', fontSize: 11, fontWeight: 700 }}>
                {saving ? 'Saving...' : 'Save Metric'}
              </button>
            </div>

            <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 8 }}>RECORD STAGE TIME</div>
            <div style={{ display: 'grid', gap: 8 }}>
              <input style={inputStyle} placeholder="Stage name" value={stageName} onChange={e => setStageName(e.target.value)} />
              <input style={inputStyle} placeholder="Duration in minutes" value={durationMinutes} onChange={e => setDurationMinutes(e.target.value)} />
              <input style={inputStyle} placeholder="Asset ID" value={assetId} onChange={e => setAssetId(e.target.value)} />
              <textarea style={{ ...inputStyle, minHeight: 70 }} placeholder="Notes" value={notes} onChange={e => setNotes(e.target.value)} />
              <button onClick={saveStageTiming} disabled={saving || !stageName || durationMinutes === ''} style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: '#ddd', cursor: saving ? 'wait' : 'pointer', fontSize: 11, fontWeight: 700 }}>
                {saving ? 'Saving...' : 'Save Stage Time'}
              </button>
            </div>
          </div>

          <div style={{ padding: 16, overflowY: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18 }}>
              {['content', 'system'].map(group => (
                <div key={group}>
                  <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 8 }}>{group.toUpperCase()} KPI DEFINITIONS</div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {(definitions[group] || []).map(metric => (
                      <div key={metric.id} style={{ padding: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4 }}>
                        <div style={{ color: '#10b981', fontWeight: 700 }}>{metric.label}</div>
                        <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>{metric.description}</div>
                        <div style={{ fontSize: 11, color: '#6c8', marginTop: 6 }}>Formula: {metric.formula}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 8 }}>LATEST METRICS</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {Object.values(dashboard?.latestByMetric || {}).map(entry => (
                  <div key={entry.id} style={{ padding: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <div>
                        <div style={{ color: '#fff', fontWeight: 700 }}>{entry.metricId}</div>
                        <div style={{ fontSize: 11, color: '#777' }}>{entry.period || 'No period'} {entry.assetId ? `· ${entry.assetId}` : ''}</div>
                      </div>
                      <div style={{ color: '#10b981', fontWeight: 700 }}>{entry.value} {entry.unit}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 8 }}>RECENT STAGE TIMINGS</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {(dashboard?.recentStageTimings || []).map(item => (
                  <div key={item.id} style={{ padding: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <div>
                        <div style={{ color: '#fff', fontWeight: 700 }}>{item.stageName}</div>
                        <div style={{ fontSize: 11, color: '#777' }}>{item.assetId || 'No asset ID'}</div>
                      </div>
                      <div style={{ color: '#10b981', fontWeight: 700 }}>{item.durationMinutes} min</div>
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
