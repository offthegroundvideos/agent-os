'use client';
import { useEffect, useMemo, useState } from 'react';

const AGENT_OPTIONS = [
  { id: 'alex', label: 'Alex', role: 'Deep Research', color: '#3b82f6' },
  { id: 'dev', label: 'Dev', role: 'Coding', color: '#10b981' },
  { id: 'cto', label: 'CTO', role: 'Technical Command', color: '#22d3ee' },
];

const QUICK_PROMPTS = {
  dev: [
    'Fix the mobile layout bug in agent-os and verify with npm run build.',
    'Implement a small bounded UI improvement in agent-os and report changed files.',
    'Debug a broken route in agent-os and patch the smallest safe fix.',
  ],
  cto: [
    'Audit the current integration path, patch the safest technical fix, and report risks.',
    'Wire a bounded systems improvement in deer-flow and verify it with the repo-native command.',
    'Investigate the current failure path, choose the smallest safe scope, and implement it.',
  ],
  alex: [
    'Research what is going viral for this niche, keep each platform separate, then synthesize the shared themes.',
    'Compare the strongest current competitors in this niche and surface the clearest operator takeaways.',
    'Investigate the current workflow gap and recommend the next best move with examples.',
  ],
};

function formatLabel(value, fallback = 'n/a') {
  if (!value) return fallback;
  return String(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatTime(value) {
  if (!value) return 'n/a';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

export default function DeerFlowPanel({ onClose }) {
  const [jobs, setJobs] = useState([]);
  const [routingPolicy, setRoutingPolicy] = useState(null);
  const [repoOptions, setRepoOptions] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [resultMessage, setResultMessage] = useState('');
  const [viewportWidth, setViewportWidth] = useState(1280);
  const [form, setForm] = useState({
    agentId: 'dev',
    message: '',
    repoPath: 'C:\\AI-Agents\\agent-os',
    validation: 'npm run build',
    mobileMode: true,
    operatorNotes: '',
    returnStyle: 'concise',
  });

  const isMobile = viewportWidth <= 900;
  const isCompact = viewportWidth <= 640;

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const updateViewport = () => setViewportWidth(window.innerWidth);
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/deerflow');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load DeerFlow jobs');
      const nextJobs = Array.isArray(data.jobs) ? data.jobs : [];
      const nextRepos = Array.isArray(data.repoOptions) ? data.repoOptions : [];
      setRoutingPolicy(data.routingPolicy || null);
      setRepoOptions(nextRepos);
      setJobs(nextJobs);
      setSelectedId((current) => {
        if (!nextJobs.length) return '';
        return current && nextJobs.some((job) => job.id === current) ? current : nextJobs[0].id;
      });
      if (nextRepos.length) {
        setForm((prev) => {
          const existing = nextRepos.find((item) => item.path === prev.repoPath);
          return existing
            ? prev
            : { ...prev, repoPath: nextRepos[0].path, validation: nextRepos[0].validation };
        });
      }
      setError('');
    } catch (err) {
      setJobs([]);
      setSelectedId('');
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function applyRepo(repoPath) {
    const matched = repoOptions.find((item) => item.path === repoPath);
    setForm((prev) => ({
      ...prev,
      repoPath,
      validation: matched?.validation || prev.validation,
    }));
  }

  async function launchJob() {
    if (!form.message.trim()) return;
    setRunning(true);
    setError('');
    setResultMessage('');
    try {
      const payload = {
        agentId: form.agentId,
        message: form.message.trim(),
        repoPath: form.agentId === 'alex' ? '' : form.repoPath,
        validation: form.agentId === 'alex' ? '' : form.validation,
        mobileMode: form.mobileMode,
        operatorNotes: form.operatorNotes.trim(),
        returnStyle: form.returnStyle,
      };
      const res = await fetch('/api/deerflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to dispatch DeerFlow task');
      setResultMessage(data.reply || 'DeerFlow task dispatched successfully.');
      setForm((prev) => ({ ...prev, message: '', operatorNotes: '' }));
      await load();
      if (data.job?.id) setSelectedId(data.job.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }

  const selected = useMemo(
    () => jobs.find((job) => job.id === selectedId) || jobs[0] || null,
    [jobs, selectedId]
  );

  const quickPrompts = QUICK_PROMPTS[form.agentId] || [];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.92)',
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
          maxWidth: 1320,
          maxHeight: isMobile ? 'calc(100vh - 20px)' : '92vh',
          overflow: 'hidden',
          background: '#0d0d14',
          border: '1px solid rgba(34,211,238,0.35)',
          borderRadius: 12,
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
              DEERFLOW OPS
            </div>
            <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>
              Launch deep research and bounded coding tasks through DeerFlow, including terse mobile coding prompts for Codex.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, width: isMobile ? '100%' : 'auto' }}>
            <button
              onClick={load}
              style={{
                flex: isMobile ? 1 : '0 0 auto',
                background: 'rgba(34,211,238,0.12)',
                border: '1px solid rgba(34,211,238,0.3)',
                color: '#22d3ee',
                padding: '8px 12px',
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
                padding: '8px 12px',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 11,
              }}
            >
                CLOSE
            </button>
          </div>
        </div>

        {error && (
          <div style={{ padding: '10px 20px', background: 'rgba(239,68,68,0.08)', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#ef4444', fontSize: 11 }}>
            {error}
          </div>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '380px 1fr',
            minHeight: 0,
            flex: 1,
          }}
        >
          <div
            style={{
              borderRight: isMobile ? 'none' : '1px solid rgba(255,255,255,0.06)',
              borderBottom: isMobile ? '1px solid rgba(255,255,255,0.06)' : 'none',
              overflowY: 'auto',
              padding: isMobile ? 14 : 16,
            }}
          >
            <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 8 }}>LAUNCH TASK</div>
            <div style={{ padding: isMobile ? 12 : 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, marginBottom: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginBottom: 10 }}>
                {AGENT_OPTIONS.map((agent) => {
                  const active = form.agentId === agent.id;
                  return (
                    <button
                      key={agent.id}
                      onClick={() => setForm((prev) => ({ ...prev, agentId: agent.id }))}
                      style={{
                        flex: 1,
                        padding: '10px 0',
                        background: active ? `${agent.color}22` : 'rgba(255,255,255,0.04)',
                        border: active ? `1px solid ${agent.color}66` : '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 8,
                        color: active ? agent.color : '#bbb',
                        cursor: 'pointer',
                        fontSize: 11,
                      }}
                    >
                      {agent.label}
                    </button>
                  );
                })}
              </div>

              <div style={{ fontSize: 11, color: '#9aa3b2', marginBottom: 12, lineHeight: 1.6 }}>
                {AGENT_OPTIONS.find((item) => item.id === form.agentId)?.role}
              </div>

              {form.agentId !== 'alex' && (
                <>
                  <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 8 }}>TARGET REPOSITORY</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                    {repoOptions.map((repo) => {
                      const active = form.repoPath === repo.path;
                      return (
                        <button
                          key={repo.path}
                          onClick={() => applyRepo(repo.path)}
                          style={{
                            padding: '8px 10px',
                            borderRadius: 999,
                            background: active ? 'rgba(16,185,129,0.14)' : 'rgba(255,255,255,0.04)',
                            border: active ? '1px solid rgba(16,185,129,0.38)' : '1px solid rgba(255,255,255,0.08)',
                            color: active ? '#6ee7b7' : '#9aa3b2',
                            cursor: 'pointer',
                            fontSize: 10,
                          }}
                        >
                          {repo.label}
                        </button>
                      );
                    })}
                  </div>

                  <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
                    <input
                      value={form.repoPath}
                      onChange={(e) => setForm((prev) => ({ ...prev, repoPath: e.target.value }))}
                      placeholder="Repository path"
                      style={{
                        width: '100%',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 8,
                        color: '#e2e2e8',
                        padding: '10px 12px',
                        fontSize: 12,
                        outline: 'none',
                      }}
                    />
                    <input
                      value={form.validation}
                      onChange={(e) => setForm((prev) => ({ ...prev, validation: e.target.value }))}
                      placeholder="Validation command"
                      style={{
                        width: '100%',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 8,
                        color: '#e2e2e8',
                        padding: '10px 12px',
                        fontSize: 12,
                        outline: 'none',
                      }}
                    />
                  </div>
                </>
              )}

              <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 8 }}>
                MOBILE-FRIENDLY STARTERS
              </div>
              <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
                {quickPrompts.map((prompt, index) => (
                  <button
                    key={`${form.agentId}-${index}`}
                    onClick={() => setForm((prev) => ({ ...prev, message: prompt }))}
                    style={{
                      textAlign: 'left',
                      padding: '10px 12px',
                      borderRadius: 8,
                      cursor: 'pointer',
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      color: '#c9d2e1',
                      fontSize: 11,
                      lineHeight: 1.6,
                    }}
                  >
                    {prompt}
                  </button>
                ))}
              </div>

              <textarea
                value={form.message}
                onChange={(e) => setForm((prev) => ({ ...prev, message: e.target.value }))}
                placeholder={form.agentId === 'alex'
                  ? 'Research what is going viral for this niche, keep platform findings separate, then synthesize the global themes.'
                  : 'Describe the coding job in one or two sentences. Codex will inspect the repo, choose the smallest safe scope, implement it, and verify it.'}
                style={{
                  width: '100%',
                  minHeight: isMobile ? 130 : 160,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  color: '#e2e2e8',
                  padding: '10px 12px',
                  fontSize: 12,
                  lineHeight: 1.6,
                  resize: 'vertical',
                  outline: 'none',
                  marginBottom: 10,
                }}
              />

              <textarea
                value={form.operatorNotes}
                onChange={(e) => setForm((prev) => ({ ...prev, operatorNotes: e.target.value }))}
                placeholder="Optional notes: mobile context, constraints, acceptance hints, or what matters most."
                style={{
                  width: '100%',
                  minHeight: 76,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 8,
                  color: '#cfd6e4',
                  padding: '10px 12px',
                  fontSize: 11,
                  lineHeight: 1.6,
                  resize: 'vertical',
                  outline: 'none',
                  marginBottom: 10,
                }}
              />

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flexDirection: isCompact ? 'column' : 'row', marginBottom: 12 }}>
                <button
                  onClick={() => setForm((prev) => ({ ...prev, mobileMode: !prev.mobileMode }))}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 999,
                    background: form.mobileMode ? 'rgba(34,211,238,0.16)' : 'rgba(255,255,255,0.04)',
                    border: form.mobileMode ? '1px solid rgba(34,211,238,0.35)' : '1px solid rgba(255,255,255,0.08)',
                    color: form.mobileMode ? '#67e8f9' : '#98a2b3',
                    cursor: 'pointer',
                    fontSize: 10,
                    width: isCompact ? '100%' : 'auto',
                  }}
                >
                  {form.mobileMode ? 'MOBILE MODE ON' : 'MOBILE MODE OFF'}
                </button>
                <button
                  onClick={() => setForm((prev) => ({ ...prev, returnStyle: prev.returnStyle === 'concise' ? 'standard' : 'concise' }))}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 999,
                    background: form.returnStyle === 'concise' ? 'rgba(16,185,129,0.16)' : 'rgba(255,255,255,0.04)',
                    border: form.returnStyle === 'concise' ? '1px solid rgba(16,185,129,0.35)' : '1px solid rgba(255,255,255,0.08)',
                    color: form.returnStyle === 'concise' ? '#6ee7b7' : '#98a2b3',
                    cursor: 'pointer',
                    fontSize: 10,
                    width: isCompact ? '100%' : 'auto',
                  }}
                >
                  {form.returnStyle === 'concise' ? 'CONCISE RETURN' : 'STANDARD RETURN'}
                </button>
              </div>

              <div style={{ fontSize: 10, color: '#6d7788', lineHeight: 1.6, marginBottom: 10 }}>
                {form.agentId === 'alex'
                  ? 'Alex sends deep research to DeerFlow. Use short prompts and let the system expand the work.'
                  : 'Dev and CTO send bounded coding work to DeerFlow. Mobile mode tells Codex to infer the safest small slice from a terse operator request.'}
              </div>

              <button
                onClick={launchJob}
                disabled={running || !form.message.trim()}
                style={{
                  width: '100%',
                  padding: '12px 0',
                  background: running ? 'rgba(34,211,238,0.08)' : 'rgba(34,211,238,0.16)',
                  border: '1px solid rgba(34,211,238,0.35)',
                  borderRadius: 8,
                  color: '#22d3ee',
                  cursor: running || !form.message.trim() ? 'not-allowed' : 'pointer',
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                }}
              >
                {running ? 'DISPATCHING...' : form.agentId === 'alex' ? 'LAUNCH DEEP RESEARCH' : 'LAUNCH MOBILE CODING TASK'}
              </button>
            </div>

            {routingPolicy && (
              <div style={{ padding: 14, background: 'rgba(34,211,238,0.05)', border: '1px solid rgba(34,211,238,0.18)', borderRadius: 10, marginBottom: 16 }}>
                <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 8 }}>ROUTING POLICY</div>
                <div style={{ fontSize: 11, color: '#d9fbff', lineHeight: 1.8 }}>
                  <div style={{ marginBottom: 8 }}>Auto DeerFlow: {(routingPolicy.autoDeerFlow || []).join(', ')}</div>
                  <div style={{ marginBottom: 8 }}>Always local: {(routingPolicy.alwaysLocal || []).join(', ')}</div>
                  <div>Local first: {(routingPolicy.localFirst || []).join(', ')}</div>
                </div>
              </div>
            )}

            {resultMessage && (
              <div style={{ padding: 12, background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.22)', borderRadius: 10, fontSize: 11, color: '#b6f3ff', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                {resultMessage}
              </div>
            )}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : '320px 1fr',
              minHeight: 0,
            }}
          >
            <div style={{ borderRight: isMobile ? 'none' : '1px solid rgba(255,255,255,0.06)', borderBottom: isMobile ? '1px solid rgba(255,255,255,0.06)' : 'none', overflowY: 'auto', padding: 16 }}>
              <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 8 }}>JOB HISTORY</div>
              {loading ? (
                <div style={{ color: '#666', fontSize: 12 }}>Loading...</div>
              ) : jobs.length === 0 ? (
                <div style={{ color: '#666', fontSize: 12 }}>No DeerFlow jobs yet.</div>
              ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                  {jobs.map((job) => (
                    <button
                      key={job.id}
                      onClick={() => setSelectedId(job.id)}
                      style={{
                        textAlign: 'left',
                        padding: 12,
                        borderRadius: 8,
                        cursor: 'pointer',
                        background: selectedId === job.id ? 'rgba(34,211,238,0.12)' : 'rgba(255,255,255,0.03)',
                        border: selectedId === job.id ? '1px solid rgba(34,211,238,0.35)' : '1px solid rgba(255,255,255,0.06)',
                        color: '#e2e2e8',
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>{formatLabel(job.agentId)} · {formatLabel(job.taskType)}</div>
                      <div style={{ fontSize: 11, color: '#777', marginTop: 4 }}>{formatLabel(job.status)}</div>
                      <div style={{ fontSize: 11, color: '#aaa', marginTop: 4, lineHeight: 1.5 }}>{String(job.message || '').slice(0, 110)}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div style={{ overflowY: 'auto', padding: 16 }}>
              {selected ? (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: isMobile ? 17 : 20, color: '#fff', fontWeight: 700 }}>{formatLabel(selected.agentId)} DeerFlow task</div>
                    <div style={{ fontSize: 12, color: '#777', marginTop: 4 }}>{selected.id} | {formatLabel(selected.status)}</div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, marginBottom: 16 }}>
                    <div style={{ padding: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10 }}>
                      <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 8 }}>TASK METADATA</div>
                      <div style={{ fontSize: 12, color: '#ddd', lineHeight: 1.8 }}>
                        <div>Task type: {formatLabel(selected.taskType)}</div>
                        <div>Repo: {selected.repoPath || 'n/a'}</div>
                        <div>Validation: {selected.validation || 'n/a'}</div>
                        <div>Mobile mode: {selected.mobileMode ? 'yes' : 'no'}</div>
                        <div>Return style: {formatLabel(selected.returnStyle)}</div>
                        <div>Created: {formatTime(selected.createdAt)}</div>
                        <div>Updated: {formatTime(selected.updatedAt)}</div>
                      </div>
                    </div>
                    <div style={{ padding: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10 }}>
                      <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 8 }}>SOURCE MESSAGE</div>
                      <div style={{ fontSize: 12, color: '#ddd', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{selected.message}</div>
                      {selected.operatorNotes ? (
                        <div style={{ marginTop: 12, fontSize: 11, color: '#9fb3c8', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                          Notes: {selected.operatorNotes}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {selected.reply && (
                    <div style={{ padding: 14, background: 'rgba(34,211,238,0.05)', border: '1px solid rgba(34,211,238,0.18)', borderRadius: 10, marginBottom: 16 }}>
                      <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 8 }}>DEERFLOW SUMMARY</div>
                      <div style={{ fontSize: 12, color: '#d9fbff', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{selected.reply}</div>
                    </div>
                  )}

                  {selected.error && (
                    <div style={{ padding: 14, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)', borderRadius: 10, marginBottom: 16 }}>
                      <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 8 }}>ERROR</div>
                      <div style={{ fontSize: 12, color: '#ef4444', lineHeight: 1.8 }}>{selected.error}</div>
                    </div>
                  )}

                  {selected.result && (
                    <div style={{ padding: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10 }}>
                      <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 8 }}>RAW RESULT</div>
                      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#ddd', fontSize: isMobile ? 10 : 11, lineHeight: 1.6 }}>
                        {JSON.stringify(selected.result, null, 2)}
                      </pre>
                    </div>
                  )}
                </>
              ) : (
                <div style={{ color: '#666', fontSize: 12 }}>Select a DeerFlow job to inspect it.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
