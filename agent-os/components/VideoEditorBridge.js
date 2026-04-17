'use client';

import { useEffect, useState } from 'react';
import WorkingMemoryPanel from './WorkingMemoryPanel';

export default function VideoEditorBridge() {
  const [integrationStatus, setIntegrationStatus] = useState(null);
  const [footage, setFootage] = useState([]);
  const [statusError, setStatusError] = useState(null);
  const [sendingClipId, setSendingClipId] = useState(null);
  const [sendMessage, setSendMessage] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        const [statusResponse, footageResponse] = await Promise.all([
          fetch('/api/video-editor?action=status'),
          fetch('/api/video-editor?action=footage'),
        ]);
        const [statusJson, footageJson] = await Promise.all([statusResponse.json(), footageResponse.json()]);
        if (cancelled) {
          return;
        }
        if (!statusResponse.ok) {
          throw new Error(statusJson.error || 'Failed to load video editor status.');
        }
        setIntegrationStatus(statusJson);
        setFootage(Array.isArray(footageJson.clips) ? footageJson.clips : []);
        setStatusError(null);
      } catch (error) {
        if (!cancelled) {
          setStatusError(error.message);
        }
      }
    }

    loadData();
    const intervalId = window.setInterval(loadData, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  const editorUrl = integrationStatus?.editorUrl || 'http://127.0.0.1:3300/projects/demo-social-cut';
  const project = integrationStatus?.project || null;
  const resolveStatus = integrationStatus?.resolveStatus || null;
  const exportStatus = integrationStatus?.exportStatus || null;
  const frontendOnline = integrationStatus ? true : null;
  const backendOnline = resolveStatus ? true : null;

  async function sendClipToEditor(clipId) {
    setSendingClipId(clipId);
    setSendMessage(null);
    try {
      const response = await fetch('/api/video-editor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sendClip', clipId }),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || 'Failed to send the clip to the editor.');
      }
      setSendMessage(`Sent clip to video editor project ${json.project.title || json.project.id}.`);
      const refreshed = await fetch('/api/video-editor?action=status').then((res) => res.json());
      setIntegrationStatus(refreshed);
    } catch (error) {
      setSendMessage(error.message);
    } finally {
      setSendingClipId(null);
    }
  }

  const statusTone =
    frontendOnline && backendOnline
      ? { border: 'rgba(16,185,129,0.26)', bg: 'rgba(16,185,129,0.08)', color: '#10b981' }
      : { border: 'rgba(245,158,11,0.28)', bg: 'rgba(245,158,11,0.08)', color: '#f59e0b' };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #050508, #090c12)', color: '#e2e2e8' }}>
      <div
        style={{
          maxWidth: 1500,
          margin: '0 auto',
          padding: '20px 18px 28px',
          display: 'grid',
          gap: 16,
        }}
      >
        <header
          style={{
            display: 'grid',
            gap: 12,
            padding: '18px 20px',
            borderRadius: 18,
            border: '1px solid rgba(255,255,255,0.08)',
            background:
              'radial-gradient(circle at top left, rgba(249,115,22,0.14), transparent 34%), linear-gradient(180deg, rgba(13,13,20,0.92), rgba(8,10,16,0.94))',
            boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <div
                style={{
                  fontFamily: 'Orbitron, sans-serif',
                  fontSize: 11,
                  letterSpacing: '0.14em',
                  color: '#f97316',
                  marginBottom: 8,
                }}
              >
                AGENT OS / VIDEO EDITOR
              </div>
              <h1
                style={{
                  margin: 0,
                  fontFamily: 'Orbitron, sans-serif',
                  fontSize: 'clamp(1.6rem, 3vw, 2.4rem)',
                  lineHeight: 1.05,
                }}
              >
                Edit inside Agent OS without leaving the dashboard.
              </h1>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <a
                href="/"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 44,
                  padding: '0 16px',
                  borderRadius: 999,
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: '#c6cad6',
                  textDecoration: 'none',
                }}
              >
                Back to Mission Control
              </a>
              <a
                href={editorUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 44,
                  padding: '0 16px',
                  borderRadius: 999,
                  border: '1px solid rgba(249,115,22,0.34)',
                  background: 'rgba(249,115,22,0.12)',
                  color: '#f97316',
                  textDecoration: 'none',
                  fontFamily: 'Orbitron, sans-serif',
                  letterSpacing: '0.08em',
                  fontSize: 11,
                }}
              >
                Open Full Editor
              </a>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 12,
            }}
          >
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 14,
                border: `1px solid ${statusTone.border}`,
                background: statusTone.bg,
              }}
            >
              <div style={{ fontSize: 10, color: '#7d8596', letterSpacing: '0.14em', marginBottom: 6 }}>
                INTEGRATION STATUS
              </div>
              <div style={{ fontSize: 12, color: statusTone.color }}>
                Frontend: {frontendOnline === null ? 'Checking...' : frontendOnline ? 'Live' : 'Offline'} / API:{' '}
                {backendOnline === null ? 'Checking...' : backendOnline ? 'Live' : 'Offline'}
              </div>
            </div>
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 14,
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.03)',
              }}
            >
              <div style={{ fontSize: 10, color: '#7d8596', letterSpacing: '0.14em', marginBottom: 6 }}>
                CONNECTED PROJECT
              </div>
              <div style={{ fontSize: 12, color: '#d7dceb' }}>
                {project?.title || project?.id || 'Loading project...'}
              </div>
            </div>
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 14,
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.03)',
              }}
            >
              <div style={{ fontSize: 10, color: '#7d8596', letterSpacing: '0.14em', marginBottom: 6 }}>
                RENDER / EXPORT STATUS
              </div>
              <div style={{ fontSize: 12, color: '#d7dceb', overflowWrap: 'anywhere' }}>
                {exportStatus?.exists
                  ? `Latest export found at ${exportStatus.updatedAt || 'unknown time'}`
                  : project?.lastSummary || 'No export detected yet.'}
              </div>
            </div>
          </div>
        </header>

        {(frontendOnline === false || statusError) && (
          <div
            style={{
              padding: '16px 18px',
              borderRadius: 16,
              border: '1px solid rgba(245,158,11,0.28)',
              background: 'rgba(245,158,11,0.08)',
              lineHeight: 1.7,
              color: '#eac27f',
            }}
          >
            {statusError ? `${statusError} ` : null}
            The standalone video editor frontend is not reachable yet. Start it from{' '}
            <code style={{ color: '#f3f4f6' }}>C:\Video Editor</code> with{' '}
            <code style={{ color: '#f3f4f6' }}>pnpm dev:web</code>, and start the backend with{' '}
            <code style={{ color: '#f3f4f6' }}>pnpm dev:api</code>.
          </div>
        )}

        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.3fr) minmax(280px, 380px)',
            gap: 16,
          }}
        >
          <div
            style={{
              padding: '16px 18px',
              borderRadius: 18,
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.03)',
            }}
          >
            <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 11, color: '#f97316', letterSpacing: '0.12em', marginBottom: 10 }}>
              EDITOR STATUS
            </div>
            <div style={{ display: 'grid', gap: 8, fontSize: 12, lineHeight: 1.7, color: '#d7dceb' }}>
              <div>Project status: {project?.status || 'Unknown'}</div>
              <div>Assets in editor: {project?.assetCount ?? 0}</div>
              <div>Prompt runs: {project?.promptRuns ?? 0}</div>
              <div>Current cut: {project?.compositionDurationSeconds ? `${project.compositionDurationSeconds}s` : 'No cut yet'}</div>
              <div>Resolve connection: {resolveStatus?.liveAvailable ? 'Live' : resolveStatus?.issue || 'Unavailable'}</div>
              <div>Export file: {exportStatus?.exists ? exportStatus.outputPath : 'Not found yet'}</div>
            </div>
          </div>

          <div
            style={{
              padding: '16px 18px',
              borderRadius: 18,
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.03)',
            }}
          >
            <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 11, color: '#f97316', letterSpacing: '0.12em', marginBottom: 10 }}>
              FOOTAGE LIBRARY HANDOFF
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {(footage || []).slice(0, 5).map((clip) => (
                <div
                  key={clip.id}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 14,
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(255,255,255,0.03)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: '#e7eaf2', fontWeight: 600 }}>{clip.title}</div>
                      <div style={{ fontSize: 10, color: '#7d8596', marginTop: 4, overflowWrap: 'anywhere' }}>
                        {clip.resolvedPath || 'No path available'}
                      </div>
                    </div>
                    <button
                      disabled={!clip.canSendToEditor || sendingClipId === clip.id}
                      onClick={() => sendClipToEditor(clip.id)}
                      style={{
                        minHeight: 38,
                        padding: '0 12px',
                        borderRadius: 999,
                        border: '1px solid rgba(249,115,22,0.34)',
                        background: clip.canSendToEditor ? 'rgba(249,115,22,0.12)' : 'rgba(255,255,255,0.05)',
                        color: clip.canSendToEditor ? '#f97316' : '#6c7280',
                        cursor: clip.canSendToEditor ? 'pointer' : 'not-allowed',
                        whiteSpace: 'nowrap',
                      }}
                      type="button"
                    >
                      {sendingClipId === clip.id ? 'Sending...' : 'Send to editor'}
                    </button>
                  </div>
                </div>
              ))}
              {sendMessage && (
                <div style={{ fontSize: 11, color: '#d7dceb', lineHeight: 1.6 }}>
                  {sendMessage}
                </div>
              )}
            </div>
          </div>
        </section>

        <WorkingMemoryPanel />

        <section
          style={{
            borderRadius: 20,
            overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(7,9,14,0.92)',
            boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
          }}
        >
          <iframe
            title="AI Video Editor"
            src={editorUrl}
            style={{
              width: '100%',
              minHeight: 'calc(100vh - 260px)',
              border: 0,
              background: '#0b1018',
            }}
          />
        </section>
      </div>
    </div>
  );
}
