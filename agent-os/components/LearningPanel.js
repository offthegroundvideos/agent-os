'use client';
import { useState, useEffect, useRef } from 'react';

const AGENTS = {
  alex:   { name: 'Alex',   color: '#3b82f6', icon: '🔍', role: 'Market Intelligence' },
  maya:   { name: 'Maya',   color: '#ec4899', icon: '✍️', role: 'Creative Director' },
  jordan: { name: 'Jordan', color: '#f59e0b', icon: '📈', role: 'Growth Strategist' },
  dev:    { name: 'Dev',    color: '#10b981', icon: '💻', role: 'Tech Lead' },
  sam:    { name: 'Sam',    color: '#8b5cf6', icon: '📱', role: 'Social Media Director' },
  luna:   { name: 'Luna',   color: '#06b6d4', icon: '🎯', role: 'Lead Qualifier' },
  iris:   { name: 'Iris',   color: '#f97316', icon: '📸', role: 'Visual Strategist' },
  rex:    { name: 'Rex',    color: '#84cc16', icon: '💼', role: 'Sales Agent' },
  nova:   { name: 'Nova',   color: '#e879f9', icon: '🌟', role: 'Client Success' },
  pixel:  { name: 'Pixel',  color: '#f472b6', icon: '🎨', role: 'Brand and Product' },
  ceo:    { name: 'Chief',  color: '#fbbf24', icon: 'ðŸ‘”', role: 'Executive Command' },
  cto:    { name: 'Arch',   color: '#22d3ee', icon: 'ðŸ—ï¸', role: 'Technical Command' },
};

function ScoreTrend({ scores, color }) {
  if (!scores || scores.length === 0) return null;
  const max = 10;
  const h = 28;
  const w = 8;
  const gap = 3;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap, height: h }}>
      {scores.map((s, i) => {
        const barH = Math.max(3, Math.round((s / max) * h));
        const barColor = s >= 8 ? '#10b981' : s >= 6 ? '#f59e0b' : '#ef4444';
        return (
          <div key={i} title={`Score: ${s}/10`} style={{
            width: w, height: barH, background: barColor,
            borderRadius: 2, opacity: 0.8,
            transition: 'height 0.3s',
          }} />
        );
      })}
    </div>
  );
}

function ScoreRing({ score, color }) {
  const c = score >= 8 ? '#10b981' : score >= 6 ? '#f59e0b' : '#ef4444';
  return (
    <div style={{
      fontFamily: 'Orbitron, sans-serif', fontSize: 22, fontWeight: 800, color: c,
    }}>
      {score > 0 ? score : '—'}
    </div>
  );
}

function formatWorkflowLabel(workflowType) {
  const labels = {
    chat: 'Chat',
    pipeline: 'Pipeline',
    autojob: 'Auto-Job',
    n8n: 'n8n',
    manual: 'Manual',
  };
  return labels[workflowType] || 'Manual';
}

export default function LearningPanel({ onClose }) {
  const [summary, setSummary] = useState([]);
  const [selected, setSelected] = useState('alex');
  const [lessons, setLessons] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reflecting, setReflecting] = useState(false);
  const [refining, setRefining] = useState(false);
  const [actionMsg, setActionMsg] = useState('');
  const [loadError, setLoadError] = useState('');
  const autoRefreshRef = useRef(null);

  useEffect(() => {
    loadAll();
    // Auto-refresh every 30s while panel is open
    autoRefreshRef.current = setInterval(() => {
      loadAll(true);
      if (selected) loadLessons(selected, true);
    }, 30000);
    return () => clearInterval(autoRefreshRef.current);
  }, []);

  useEffect(() => {
    if (selected) loadLessons(selected);
  }, [selected]);

  const loadAll = async (silent = false) => {
    try {
      const res = await fetch('/api/reflect');
      if (!res.ok) throw new Error('Failed to load learning summary');
      const data = await res.json();
      setSummary(Array.isArray(data) ? data : []);
      setLoadError('');
    } catch (error) {
      if (!silent) setLoadError(error.message);
      setSummary([]);
    }
    if (!silent) setLoading(false);
  };

  const loadLessons = async (agentId, silent = false) => {
    try {
      const res = await fetch('/api/reflect?agentId=' + agentId);
      if (!res.ok) throw new Error('Failed to load lessons');
      const data = await res.json();
      setLessons(data && typeof data === 'object' ? data : null);
      setLoadError('');
    } catch (error) {
      if (!silent) setLoadError(error.message);
      setLessons(null);
    }
    if (!silent) setLoading(false);
  };

  const triggerReflect = async () => {
    setReflecting(true);
    setActionMsg('');
    try {
      const res = await fetch('/api/reflect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: selected, action: 'rereflect' }),
      });
      const data = await res.json();
      if (data.error) {
        setActionMsg('Error: ' + data.error);
      } else {
        setActionMsg(`Reflected: score ${data.reflection?.score}/10 — ${data.reflection?.improvement || ''}`);
        await loadAll(true);
        await loadLessons(selected, true);
      }
    } catch (e) {
      setActionMsg('Reflection failed: ' + e.message);
    } finally {
      setReflecting(false);
    }
  };

  const triggerRefine = async () => {
    setRefining(true);
    setActionMsg('');
    try {
      const res = await fetch('/api/reflect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: selected, action: 'refine' }),
      });
      const data = await res.json();
      if (data.error) {
        setActionMsg('Error: ' + data.error);
      } else {
        setActionMsg(`Skill upgrades refined for ${data.agentName} from ${data.lessonCount} lessons`);
        await loadLessons(selected, true);
        await loadAll(true);
      }
    } catch (e) {
      setActionMsg('Refine failed: ' + e.message);
    } finally {
      setRefining(false);
    }
  };

  const agent = AGENTS[selected];
  const agentSummary = summary.find(s => s.agentId === selected);
  const scoreTrend = agentSummary?.scoreTrend || lessons?.lessons?.slice(-10).map(l => l.score) || [];
  const workflowStats = agentSummary?.workflowStats || lessons?.workflowStats || {};
  const activeWorkflowStats = Object.entries(workflowStats)
    .filter(([, stats]) => (stats?.taskCount || 0) > 0)
    .sort((a, b) => (b[1]?.taskCount || 0) - (a[1]?.taskCount || 0));

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 24,
    }}>
      <div style={{
        background: '#0d0d14',
        border: '1px solid rgba(139,92,246,0.3)',
        borderRadius: 4, width: '100%', maxWidth: 1240,
        maxHeight: '92vh', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 0 60px rgba(139,92,246,0.1)',
      }}>

        {/* Header */}
        <div style={{
          padding: '14px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 13, fontWeight: 700, color: '#8b5cf6', letterSpacing: '0.1em' }}>
              🧠 AGENT INTELLIGENCE
            </div>
            <div style={{ fontSize: 10, color: '#444', marginTop: 2 }}>
              Agents self-reflect after every task · Skill upgrades inject into future prompts · Auto-refresh 30s
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={triggerReflect}
              disabled={reflecting || refining}
              title="Re-run reflection on this agent's last task"
              style={{
                background: reflecting ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.08)',
                border: '1px solid rgba(59,130,246,0.3)',
                color: '#3b82f6', padding: '5px 14px', borderRadius: 2,
                cursor: reflecting ? 'wait' : 'pointer', fontSize: 11,
                fontFamily: 'JetBrains Mono', whiteSpace: 'nowrap',
              }}
            >
              {reflecting ? '⟳ Reflecting...' : '⚡ Re-Reflect'}
            </button>
            <button
              onClick={triggerRefine}
              disabled={reflecting || refining}
              title="Synthesize lessons into permanent skill upgrades"
              style={{
                background: refining ? 'rgba(139,92,246,0.2)' : 'rgba(139,92,246,0.1)',
                border: '1px solid rgba(139,92,246,0.4)',
                color: '#8b5cf6', padding: '5px 14px', borderRadius: 2,
                cursor: refining ? 'wait' : 'pointer', fontSize: 11,
                fontFamily: 'JetBrains Mono', whiteSpace: 'nowrap',
              }}
            >
              {refining ? '⟳ Refining...' : '⬆ Refine Skills'}
            </button>
            <button onClick={onClose} style={{
              background: 'transparent', border: '1px solid #333',
              color: '#888', padding: '5px 12px', borderRadius: 2,
              cursor: 'pointer', fontSize: 11, fontFamily: 'JetBrains Mono',
            }}>✕</button>
          </div>
        </div>

        {/* Action message */}
        {actionMsg && (
          <div style={{
            padding: '8px 20px', fontSize: 11,
            background: actionMsg.startsWith('Error') ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)',
            color: actionMsg.startsWith('Error') ? '#ef4444' : '#10b981',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
          }}>
            {actionMsg}
          </div>
        )}
        {loadError && (
          <div style={{
            padding: '8px 20px',
            fontSize: 11,
            background: 'rgba(239,68,68,0.08)',
            color: '#ef4444',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
          }}>
            {loadError}
          </div>
        )}

        {/* Main body: sidebar + detail */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* Agent sidebar */}
          <div style={{
            width: 210, flexShrink: 0,
            borderRight: '1px solid rgba(255,255,255,0.06)',
            overflowY: 'auto',
            padding: '8px 0',
          }}>
            {Object.entries(AGENTS).map(([id, a]) => {
              const s = summary.find(x => x.agentId === id);
              const isSelected = selected === id;
              const scoreColor = (s?.avgScore || 0) >= 8 ? '#10b981' : (s?.avgScore || 0) >= 6 ? '#f59e0b' : (s?.avgScore || 0) > 0 ? '#ef4444' : '#444';
              return (
                <div key={id} onClick={() => setSelected(id)} style={{
                  padding: '10px 16px',
                  background: isSelected ? a.color + '14' : 'transparent',
                  borderLeft: isSelected ? '3px solid ' + a.color : '3px solid transparent',
                  cursor: 'pointer', transition: 'all 0.15s',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <div style={{ fontSize: 18, flexShrink: 0 }}>{a.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: 'Orbitron, sans-serif', fontSize: 10, fontWeight: 700,
                      color: isSelected ? a.color : '#888',
                      display: 'flex', alignItems: 'center', gap: 5,
                    }}>
                      {a.name}
                      {s?.refinements?.length > 0 && (
                        <span style={{ fontSize: 7, color: '#8b5cf6' }}>⬆</span>
                      )}
                    </div>
                    <div style={{ fontSize: 9, color: '#444', marginTop: 1 }}>{a.role}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{
                      fontFamily: 'Orbitron, sans-serif', fontSize: 16, fontWeight: 800,
                      color: scoreColor, lineHeight: 1,
                    }}>
                      {s?.avgScore > 0 ? s.avgScore : '—'}
                    </div>
                    <div style={{ fontSize: 8, color: '#444', marginTop: 2 }}>
                      {s?.taskCount || 0} tasks
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

        {/* Detail panel */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#444', fontSize: 12 }}>
              Loading intelligence data...
            </div>
          ) : (
            <div>

              {/* Stats + Score Trend */}
              <div style={{
                padding: '12px 16px', marginBottom: 16,
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 6,
                display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center',
              }}>
                {agentSummary && [
                  { label: 'AVG SCORE', value: agentSummary.avgScore || '—', color: agentSummary.avgScore >= 8 ? '#10b981' : agentSummary.avgScore >= 6 ? '#f59e0b' : '#ef4444' },
                  { label: 'TASKS', value: agentSummary.taskCount || 0, color: '#e2e2e8' },
                  { label: 'WINS', value: agentSummary.winCount || 0, color: '#10b981' },
                  { label: 'FAILURES', value: agentSummary.failureCount || 0, color: '#ef4444' },
                  { label: 'SKILL UPS', value: agentSummary.refinements?.length || 0, color: '#8b5cf6' },
                ].map((stat, i) => (
                  <div key={i} style={{ textAlign: 'center' }}>
                    <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 24, fontWeight: 800, color: stat.color }}>{stat.value}</div>
                    <div style={{ fontSize: 9, color: '#444' }}>{stat.label}</div>
                  </div>
                ))}
                {scoreTrend.length > 0 && (
                  <div style={{ marginLeft: 'auto' }}>
                    <div style={{ fontSize: 9, color: '#444', marginBottom: 4, textAlign: 'right' }}>SCORE TREND</div>
                    <ScoreTrend scores={scoreTrend} color={agent?.color} />
                  </div>
                )}
              </div>

              {/* Workflow breakdown */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 9, color: '#22d3ee', letterSpacing: '0.2em', marginBottom: 8 }}>
                  WORKFLOW BREAKDOWN
                </div>
                {activeWorkflowStats.length > 0 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
                    {activeWorkflowStats.map(([workflowType, stats]) => (
                      <div key={workflowType} style={{
                        padding: '10px 12px',
                        background: 'rgba(34,211,238,0.06)',
                        border: '1px solid rgba(34,211,238,0.18)',
                        borderRadius: 4,
                      }}>
                        <div style={{ fontSize: 10, color: '#67e8f9', fontFamily: 'Orbitron, sans-serif', marginBottom: 6 }}>
                          {formatWorkflowLabel(workflowType)}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#cbd5e1', marginBottom: 4 }}>
                          <span>Tasks</span>
                          <span>{stats.taskCount || 0}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#cbd5e1', marginBottom: 4 }}>
                          <span>Avg</span>
                          <span>{stats.avgScore || '—'}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#10b981', marginBottom: 4 }}>
                          <span>Wins</span>
                          <span>{stats.winCount || 0}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#ef4444' }}>
                          <span>Failures</span>
                          <span>{stats.failureCount || 0}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: 12, color: '#333', fontSize: 11, border: '1px solid rgba(255,255,255,0.04)', borderRadius: 4, lineHeight: 1.7 }}>
                    No workflow-specific learning yet.
                  </div>
                )}
              </div>

              {/* Skill Upgrades (Refinements) */}
              {lessons?.refinements?.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 9, color: '#8b5cf6', letterSpacing: '0.2em', marginBottom: 8 }}>
                    ⬆ SKILL UPGRADES — PERMANENTLY INJECTED INTO PROMPTS
                    {lessons.refinedAt && (
                      <span style={{ color: '#333', marginLeft: 8 }}>
                        (refined {new Date(lessons.refinedAt).toLocaleDateString()})
                      </span>
                    )}
                  </div>
                  {lessons.refinements.map((r, i) => (
                    <div key={i} style={{
                      padding: '8px 12px', marginBottom: 6,
                      background: 'rgba(139,92,246,0.08)',
                      border: '1px solid rgba(139,92,246,0.25)',
                      borderRadius: 4, fontSize: 11, color: '#a78bfa', lineHeight: 1.5,
                    }}>
                      ⬆ {r}
                    </div>
                  ))}
                </div>
              )}

              {/* Wins and Failures */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 9, color: '#10b981', letterSpacing: '0.2em', marginBottom: 8 }}>
                    ✓ WINS — WHAT WORKS
                  </div>
                  {lessons?.wins?.length > 0 ? (
                    lessons.wins.slice(-6).reverse().map((w, i) => (
                      <div key={i} style={{
                        padding: '8px 12px', marginBottom: 6,
                        background: 'rgba(16,185,129,0.06)',
                        border: '1px solid rgba(16,185,129,0.2)',
                        borderRadius: 4, fontSize: 11, color: '#10b981', lineHeight: 1.5,
                      }}>
                        ✓ {w.description}
                        {w.workflowType && <div style={{ fontSize: 9, color: '#67e8f9', marginTop: 3 }}>{formatWorkflowLabel(w.workflowType)}</div>}
                        {w.task && <div style={{ fontSize: 9, color: '#444', marginTop: 3 }}>{w.task.substring(0, 60)}</div>}
                      </div>
                    ))
                  ) : (
                    <div style={{ padding: 12, color: '#333', fontSize: 11, border: '1px solid rgba(255,255,255,0.04)', borderRadius: 4, lineHeight: 1.7 }}>
                      No wins yet. Captured when {agent?.name || 'this agent'} scores 8+.
                    </div>
                  )}
                </div>

                <div>
                  <div style={{ fontSize: 9, color: '#ef4444', letterSpacing: '0.2em', marginBottom: 8 }}>
                    ✗ FAILURES — WHAT TO FIX
                  </div>
                  {lessons?.failures?.length > 0 ? (
                    lessons.failures.slice(-6).reverse().map((f, i) => (
                      <div key={i} style={{
                        padding: '8px 12px', marginBottom: 6,
                        background: f.severity === 'critical' ? 'rgba(255,59,92,0.08)' : 'rgba(239,68,68,0.06)',
                        border: '1px solid ' + (f.severity === 'critical' ? 'rgba(255,59,92,0.3)' : 'rgba(239,68,68,0.2)'),
                        borderRadius: 4,
                      }}>
                        <div style={{ fontSize: 11, color: f.severity === 'critical' ? '#ff3b5c' : '#ef4444', lineHeight: 1.5, marginBottom: 4 }}>
                          {f.severity === 'critical' ? '🚨' : '⚠'} {f.description}
                        </div>
                        {f.fix && <div style={{ fontSize: 10, color: '#f59e0b', lineHeight: 1.4 }}>Fix: {f.fix}</div>}
                        <div style={{ fontSize: 9, color: '#444', marginTop: 4 }}>
                          {f.severity?.toUpperCase()} · Score: {f.score}{f.workflowType ? ` · ${formatWorkflowLabel(f.workflowType)}` : ''}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ padding: 12, color: '#333', fontSize: 11, border: '1px solid rgba(255,255,255,0.04)', borderRadius: 4, lineHeight: 1.7 }}>
                      No failures recorded yet.
                    </div>
                  )}
                </div>
              </div>

              {/* Full lesson timeline */}
              {lessons?.lessons?.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 9, color: '#444', letterSpacing: '0.2em', marginBottom: 8 }}>
                    LESSON TIMELINE — LAST {Math.min(lessons.lessons.length, 10)}
                  </div>
                  {lessons.lessons.slice(-10).reverse().map((l, i) => (
                    <div key={i} style={{
                      padding: '8px 12px', marginBottom: 5,
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.05)',
                      borderRadius: 4,
                      borderLeft: '3px solid ' + (
                        l.score >= 9 ? '#10b981' :
                        l.score >= 7 ? '#3b82f6' :
                        l.score >= 5 ? '#f59e0b' : '#ef4444'
                      ),
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 9, color: '#555' }}>{new Date(l.timestamp).toLocaleDateString()}</span>
                        <span style={{
                          fontSize: 11, fontWeight: 700, fontFamily: 'Orbitron, sans-serif',
                          color: l.score >= 9 ? '#10b981' : l.score >= 7 ? '#3b82f6' : l.score >= 5 ? '#f59e0b' : '#ef4444',
                        }}>{l.score}/10</span>
                      </div>
                      {l.workflowType && (
                        <div style={{ fontSize: 9, color: '#67e8f9', marginBottom: 4 }}>
                          {formatWorkflowLabel(l.workflowType)}
                        </div>
                      )}
                      {l.task && <div style={{ fontSize: 9, color: '#444', marginBottom: 4 }}>Task: {l.task.substring(0, 80)}</div>}
                      {l.what_worked && <div style={{ fontSize: 10, color: '#10b981', lineHeight: 1.4, marginBottom: 2 }}>✓ {l.what_worked}</div>}
                      {l.what_failed && <div style={{ fontSize: 10, color: '#f59e0b', lineHeight: 1.4, marginBottom: 2 }}>⚠ {l.what_failed}</div>}
                      {l.improvement && <div style={{ fontSize: 10, color: '#888', lineHeight: 1.4 }}>→ {l.improvement}</div>}
                    </div>
                  ))}
                </div>
              )}

              {/* How the learning loop works */}
              <div style={{
                padding: '12px 16px',
                background: 'rgba(139,92,246,0.04)',
                border: '1px solid rgba(139,92,246,0.12)',
                borderRadius: 4,
                display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16,
              }}>
                {[
                  { icon: '⚡', title: 'Auto Reflects', desc: 'After every task, agent scores itself and stores the lesson' },
                  { icon: '🧠', title: 'Pattern Finds', desc: 'Wins and failures are categorized and tracked separately' },
                  { icon: '⬆', title: 'Skill Refine', desc: 'Click Refine Skills to synthesize lessons into permanent upgrades' },
                  { icon: '🚀', title: 'Auto Injects', desc: 'Upgrades are prepended to every future prompt, improving all responses' },
                ].map((item, i) => (
                  <div key={i} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 20, marginBottom: 6 }}>{item.icon}</div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#8b5cf6', fontFamily: 'Orbitron, sans-serif', letterSpacing: '0.05em', marginBottom: 4 }}>{item.title}</div>
                    <div style={{ fontSize: 10, color: '#444', lineHeight: 1.5 }}>{item.desc}</div>
                  </div>
                ))}
              </div>

            </div>
          )}
        </div>
        </div>{/* end sidebar+detail flex row */}
      </div>
    </div>
  );
}
