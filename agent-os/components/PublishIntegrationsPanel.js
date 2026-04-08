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

function StatusPill({ ok, text }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 8px',
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.08em',
        color: ok ? '#10b981' : '#f59e0b',
        background: ok ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)',
        border: `1px solid ${ok ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}`,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: ok ? '#10b981' : '#f59e0b',
        }}
      />
      {text}
    </span>
  );
}

export default function PublishIntegrationsPanel({ onClose }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [runtime, setRuntime] = useState({
    publicMediaBaseUrl: '',
    nextPublicAppUrl: '',
    instagramMode: 'simulate',
    facebookMode: 'simulate',
    tiktokMode: 'simulate',
    youtubeMode: 'simulate',
    linkedinMode: 'simulate',
    xMode: 'simulate',
  });
  const [instagramTest, setInstagramTest] = useState(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/publish-integrations');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load publish integrations');
      setStatus(data.status || null);
      setRuntime({
        publicMediaBaseUrl: data.status?.runtime?.publicMediaBaseUrl || '',
        nextPublicAppUrl: data.status?.runtime?.nextPublicAppUrl || '',
        instagramMode: data.status?.runtime?.instagramMode || 'simulate',
        facebookMode: data.status?.runtime?.facebookMode || 'simulate',
        tiktokMode: data.status?.runtime?.tiktokMode || 'simulate',
        youtubeMode: data.status?.runtime?.youtubeMode || 'simulate',
        linkedinMode: data.status?.runtime?.linkedinMode || 'simulate',
        xMode: data.status?.runtime?.xMode || 'simulate',
      });
      setError('');
    } catch (err) {
      setStatus(null);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    setSaving(true);
    try {
      const res = await fetch('/api/publish-integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update-settings',
          publicMediaBaseUrl: runtime.publicMediaBaseUrl,
          nextPublicAppUrl: runtime.nextPublicAppUrl,
          instagramMode: runtime.instagramMode,
          facebookMode: runtime.facebookMode,
          tiktokMode: runtime.tiktokMode,
          youtubeMode: runtime.youtubeMode,
          linkedinMode: runtime.linkedinMode,
          xMode: runtime.xMode,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save publish settings');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function syncMediaHost() {
    setSaving(true);
    try {
      const res = await fetch('/api/publish-integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync-media-host' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to sync media host');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function testInstagram() {
    setSaving(true);
    try {
      const res = await fetch('/api/publish-integrations/test-instagram', {
        method: 'POST',
      });
      const data = await res.json();
      setInstagramTest(data.result || null);
      if (!res.ok) {
        setError(data.error || data.result?.message || 'Failed to test Instagram connection');
      } else {
        setError('');
      }
    } catch (err) {
      setInstagramTest(null);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 1260, maxHeight: '92vh', overflow: 'hidden', background: '#0d0d14', border: '1px solid rgba(16,185,129,0.35)', borderRadius: 6, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 13, fontWeight: 700, color: '#10b981', letterSpacing: '0.1em' }}>PUBLISH OPS</div>
            <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>Live publish readiness across adapters, credentials, media delivery, and recent queue activity.</div>
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

        <div style={{ overflowY: 'auto', padding: 16 }}>
          {loading && <div style={{ color: '#666', fontSize: 12 }}>Loading integration health...</div>}

          {!loading && status && (
            <>
              <div style={{ padding: 16, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4, marginBottom: 16 }}>
                <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 10 }}>RUNTIME SETTINGS</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 180px', gap: 10, marginBottom: 10 }}>
                  <input
                    value={runtime.publicMediaBaseUrl}
                    onChange={(e) => setRuntime((prev) => ({ ...prev, publicMediaBaseUrl: e.target.value }))}
                    placeholder="https://your-public-host.example.com"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, color: '#e2e2e8', padding: '8px 10px', fontSize: 12 }}
                  />
                  <input
                    value={runtime.nextPublicAppUrl}
                    onChange={(e) => setRuntime((prev) => ({ ...prev, nextPublicAppUrl: e.target.value }))}
                    placeholder="Optional NEXT_PUBLIC_APP_URL override"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, color: '#e2e2e8', padding: '8px 10px', fontSize: 12 }}
                  />
                  <select
                    value={runtime.instagramMode}
                    onChange={(e) => setRuntime((prev) => ({ ...prev, instagramMode: e.target.value }))}
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, color: '#e2e2e8', padding: '8px 10px', fontSize: 12 }}
                  >
                    <option value="simulate">Instagram simulate</option>
                    <option value="api">Instagram API</option>
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 10, marginBottom: 10 }}>
                  {[
                    ['facebookMode', 'Facebook Reels'],
                    ['tiktokMode', 'TikTok'],
                    ['youtubeMode', 'YouTube Shorts'],
                    ['linkedinMode', 'LinkedIn'],
                    ['xMode', 'X'],
                  ].map(([key, label]) => (
                    <div key={key} style={{ display: 'grid', gap: 6 }}>
                      <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em' }}>{label}</div>
                      <select
                        value={runtime[key]}
                        onChange={(e) => setRuntime((prev) => ({ ...prev, [key]: e.target.value }))}
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, color: '#e2e2e8', padding: '8px 10px', fontSize: 12 }}
                      >
                        <option value="simulate">Simulate</option>
                        <option value="api">API</option>
                      </select>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={saveSettings} disabled={saving} style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981', padding: '7px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>
                    {saving ? 'Working...' : 'Save Settings'}
                  </button>
                  <button onClick={syncMediaHost} disabled={saving} style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b', padding: '7px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>
                    {saving ? 'Working...' : 'Sync Existing URLs'}
                  </button>
                  <button onClick={testInstagram} disabled={saving} style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.3)', color: '#60a5fa', padding: '7px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>
                    {saving ? 'Working...' : 'Test Instagram Connection'}
                  </button>
                </div>
                {instagramTest && (
                  <div style={{ marginTop: 10, padding: 12, background: instagramTest.ok ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${instagramTest.ok ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`, borderRadius: 4, fontSize: 12, color: '#ddd', lineHeight: 1.7 }}>
                    <div style={{ color: instagramTest.ok ? '#10b981' : '#ef4444', fontWeight: 700, marginBottom: 4 }}>
                      {instagramTest.ok ? 'Instagram connection passed' : 'Instagram connection failed'}
                    </div>
                    <div>{instagramTest.message}</div>
                    {instagramTest.profile && (
                      <div style={{ marginTop: 6, color: '#9ca3af' }}>
                        {instagramTest.profile.username || 'unknown'} | {instagramTest.profile.account_type || 'account'} | {instagramTest.profile.id}
                      </div>
                    )}
                    {(instagramTest.missing || []).length > 0 && (
                      <div style={{ marginTop: 6, color: '#f59e0b' }}>
                        Missing: {instagramTest.missing.join(', ')}
                      </div>
                    )}
                    {instagramTest.error && (
                      <div style={{ marginTop: 6, color: '#fca5a5' }}>
                        {instagramTest.error}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
                <div style={{ padding: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4 }}>
                  <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 6 }}>LIVE READY</div>
                  <div style={{ fontSize: 24, color: '#10b981', fontWeight: 700 }}>{status.summary?.live_ready_platforms || 0}</div>
                </div>
                <div style={{ padding: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4 }}>
                  <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 6 }}>SIMULATE MODE</div>
                  <div style={{ fontSize: 24, color: '#f59e0b', fontWeight: 700 }}>{status.summary?.simulate_platforms || 0}</div>
                </div>
                <div style={{ padding: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4 }}>
                  <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 6 }}>QUEUE JOBS</div>
                  <div style={{ fontSize: 24, color: '#e2e2e8', fontWeight: 700 }}>{status.summary?.latest_job_count || 0}</div>
                </div>
                <div style={{ padding: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4 }}>
                  <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 6 }}>FAILED JOBS</div>
                  <div style={{ fontSize: 24, color: (status.summary?.failed_jobs || 0) > 0 ? '#ef4444' : '#10b981', fontWeight: 700 }}>{status.summary?.failed_jobs || 0}</div>
                </div>
              </div>

              <div style={{ display: 'grid', gap: 14 }}>
                {(status.platforms || []).map((platform) => (
                  <div key={platform.platform} style={{ padding: 16, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                      <div>
                        <div style={{ fontSize: 18, color: '#fff', fontWeight: 700 }}>{platform.platform_label}</div>
                        <div style={{ fontSize: 12, color: '#777', marginTop: 4 }}>
                          Mode: {platform.adapter_mode} | Adapter: {platform.adapter_implemented ? 'implemented' : 'not implemented'}
                        </div>
                      </div>
                      <StatusPill ok={platform.live_ready} text={platform.live_ready ? 'Live Ready' : platform.adapter_mode === 'simulate' ? 'Simulate Only' : 'Needs Setup'} />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 1fr', gap: 14 }}>
                      <div style={{ padding: 12, background: 'rgba(0,0,0,0.16)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
                        <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 8 }}>READINESS</div>
                        <div style={{ fontSize: 12, color: '#ddd', lineHeight: 1.8 }}>
                          <div>Configured keys: {(platform.configured_env_keys || []).length ? platform.configured_env_keys.join(', ') : 'None'}</div>
                          <div>Missing keys: {(platform.missing_env_keys || []).length ? platform.missing_env_keys.join(', ') : 'None'}</div>
                          <div>Media URL: {platform.media?.present ? 'Available' : 'Missing'}</div>
                          <div>Public media host: {platform.media?.present ? (platform.media?.publicly_reachable ? 'Yes' : 'No') : 'n/a'}</div>
                          <div>Media source: {formatLabel(platform.media?.source)}</div>
                        </div>
                      </div>

                      <div style={{ padding: 12, background: 'rgba(0,0,0,0.16)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
                        <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 8 }}>LATEST JOB</div>
                        <div style={{ fontSize: 12, color: '#ddd', lineHeight: 1.8 }}>
                          {platform.latest_job ? (
                            <>
                              <div>ID: {platform.latest_job.id}</div>
                              <div>Status: {formatLabel(platform.latest_job.publish_status)}</div>
                              <div>Attempts: {platform.latest_job.attempts}</div>
                              <div>Published at: {platform.latest_job.published_at || 'Not yet'}</div>
                              <div>Error: {platform.latest_job.error || 'None'}</div>
                            </>
                          ) : (
                            <div style={{ color: '#888' }}>No publish job for this platform yet.</div>
                          )}
                        </div>
                      </div>

                      <div style={{ padding: 12, background: 'rgba(0,0,0,0.16)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
                        <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 8 }}>NEXT STEP</div>
                        <div style={{ fontSize: 12, color: '#ddd', lineHeight: 1.8 }}>
                          {platform.next_step}
                        </div>
                        {platform.requirements?.media_url && (
                          <div style={{ marginTop: 8, fontSize: 11, color: '#9ca3af', wordBreak: 'break-word' }}>
                            Media URL: {platform.requirements.media_url}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {(status.failing_jobs || []).length > 0 && (
                <div style={{ marginTop: 16, padding: 14, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)', borderRadius: 4 }}>
                  <div style={{ fontSize: 10, color: '#ef4444', letterSpacing: '0.12em', marginBottom: 8 }}>RECENT FAILURES</div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {status.failing_jobs.map((job) => (
                      <div key={job.id} style={{ fontSize: 12, color: '#ddd', lineHeight: 1.7 }}>
                        {job.platform} | {job.id} | {job.error || 'Unknown error'}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
