'use client';
import { useEffect, useState } from 'react';

function formatLabel(value, fallback = 'n/a') {
  if (!value) return fallback;
  return String(value)
    .replace(/^cta_/, '')
    .replace(/^cmp_/, '')
    .replace(/^lpg_/, '')
    .replace(/^ast_/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function PublishQueuePanel({ onClose }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/publish-queue');
      if (!res.ok) throw new Error('Failed to load publish queue');
      const data = await res.json();
      const next = Array.isArray(data) ? data : [];
      setJobs(next);
      setSelectedId((current) => {
        if (!next.length) return '';
        return current && next.some((job) => job.id === current) ? current : next[0].id;
      });
      setError('');
      setPreview(null);
    } catch (err) {
      setJobs([]);
      setSelectedId('');
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!selected) {
      setPreview(null);
      return;
    }
    loadPreview(selected.id);
  }, [selectedId, jobs.length]);

  async function loadPreview(jobId) {
    try {
      const res = await fetch('/api/publish-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'preview', jobId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load publish preview');
      setPreview(data.preview || null);
    } catch {
      setPreview(null);
    }
  }

  async function runJob(jobId) {
    setPublishing(true);
    try {
      const res = await fetch('/api/publish-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'publish', jobId, changedBy: 'human' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to publish');
      await load();
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setPublishing(false);
    }
  }

  const selected = jobs.find((job) => job.id === selectedId) || jobs[0] || null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 1260, maxHeight: '92vh', overflow: 'hidden', background: '#0d0d14', border: '1px solid rgba(16,185,129,0.35)', borderRadius: 6, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 13, fontWeight: 700, color: '#10b981', letterSpacing: '0.1em' }}>PUBLISH QUEUE</div>
            <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>Publish-ready posts with CTA, landing page, and simulated publish controls.</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={load} style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981', padding: '5px 12px', borderRadius: 3, cursor: 'pointer', fontSize: 11 }}>
              Refresh
            </button>
            <button onClick={onClose} style={{ background: 'transparent', border: '1px solid #333', color: '#888', padding: '5px 12px', borderRadius: 3, cursor: 'pointer', fontSize: 11 }}>
              X
            </button>
          </div>
        </div>
        {error && (
          <div style={{ padding: '10px 20px', background: 'rgba(239,68,68,0.08)', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#ef4444', fontSize: 11 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', minHeight: 0, flex: 1 }}>
          <div style={{ borderRight: '1px solid rgba(255,255,255,0.06)', overflowY: 'auto', padding: 16 }}>
            <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 8 }}>JOBS</div>
            {loading ? (
              <div style={{ color: '#666', fontSize: 12 }}>Loading...</div>
            ) : jobs.length === 0 ? (
              <div style={{ color: '#666', fontSize: 12 }}>No publish jobs yet. Mark a render as publish ready first.</div>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {jobs.map((job) => (
                  <button
                    key={job.id}
                    onClick={() => setSelectedId(job.id)}
                    style={{
                      textAlign: 'left',
                      padding: 12,
                      borderRadius: 4,
                      cursor: 'pointer',
                      background: selectedId === job.id ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.03)',
                      border: selectedId === job.id ? '1px solid rgba(16,185,129,0.35)' : '1px solid rgba(255,255,255,0.06)',
                      color: '#e2e2e8',
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{formatLabel(job.platform)}</div>
                    <div style={{ fontSize: 11, color: '#777', marginTop: 4 }}>{formatLabel(job.publish_status)}</div>
                    <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>{formatLabel(job.cta_id)} | {formatLabel(job.landing_page_id)}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ overflowY: 'auto', padding: 16 }}>
            {selected ? (
              <>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 20, color: '#fff', fontWeight: 700 }}>{formatLabel(selected.platform)} publish job</div>
                  <div style={{ fontSize: 12, color: '#777', marginTop: 4 }}>{selected.id} | {selected.publish_status}</div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                  <div style={{ padding: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4 }}>
                    <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 8 }}>METADATA</div>
                    <div style={{ fontSize: 12, color: '#ddd', lineHeight: 1.8 }}>
                      <div>Asset: {formatLabel(selected.asset_id)}</div>
                      <div>Campaign: {formatLabel(selected.campaign_id)}</div>
                      <div>CTA: {formatLabel(selected.cta_id)}</div>
                      <div>Landing page: {formatLabel(selected.landing_page_id)}</div>
                      <div>Scheduled for: {selected.scheduled_for || 'n/a'}</div>
                    </div>
                  </div>

                <div style={{ padding: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4 }}>
                  <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 8 }}>RESULT</div>
                  <div style={{ fontSize: 12, color: '#ddd', lineHeight: 1.8 }}>
                      <div>Adapter: {selected.adapter_mode || 'simulate'} / {selected.publish_method || 'pending'}</div>
                      <div>Platform post ID: {selected.platform_post_id || 'Not published yet'}</div>
                      <div>Post URL: {selected.post_url || 'Not published yet'}</div>
                      <div>Media URL: {selected.media_url || preview?.requirements?.media_url || 'Not attached yet'}</div>
                      <div>Error: {selected.error || 'None'}</div>
                  </div>
                </div>
                </div>

                <div style={{ padding: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4, marginBottom: 16 }}>
                  <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 8 }}>PLATFORM PACKAGING</div>
                  <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>
                    {preview?.platform_label || formatLabel(selected.platform)} | mode: {preview?.adapter_mode || selected.adapter_mode || 'simulate'}
                  </div>
                  {preview?.requirements && (
                    <div style={{ fontSize: 11, color: preview.requirements.configured ? '#10b981' : '#f59e0b', marginBottom: 8, lineHeight: 1.6 }}>
                      {preview.requirements.configured
                        ? `Ready for live adapter. Media URL: ${preview.requirements.media_url || 'provided'}`
                        : `Missing for live publish: ${(preview.requirements.missing || []).join(', ')}`}
                    </div>
                  )}
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#ddd', fontSize: 11, lineHeight: 1.6 }}>
                    {JSON.stringify(preview?.payload || selected.platform_payload || {}, null, 2)}
                  </pre>
                </div>

                <div style={{ padding: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4, marginBottom: 16 }}>
                  <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 8 }}>CAPTION</div>
                  <div style={{ fontSize: 12, color: '#ddd', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{selected.caption}</div>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => runJob(selected.id)}
                    disabled={publishing || selected.publish_status === 'published'}
                    style={{
                      padding: '8px 14px',
                      background: publishing ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.15)',
                      border: '1px solid rgba(16,185,129,0.35)',
                      borderRadius: 4,
                      color: '#10b981',
                      cursor: publishing || selected.publish_status === 'published' ? 'not-allowed' : 'pointer',
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    {publishing
                      ? 'Publishing...'
                      : selected.publish_status === 'published'
                      ? 'Published'
                      : preview?.adapter_mode === 'api'
                      ? 'Live Publish'
                      : 'Simulate Publish'}
                  </button>
                </div>
              </>
            ) : (
              <div style={{ color: '#666', fontSize: 12 }}>Select a publish job to inspect it.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
