'use client';
import { useEffect, useState } from 'react';

const AGENTS = {
  alex: { name: 'Alex', color: '#3b82f6', icon: 'A' },
  maya: { name: 'Maya', color: '#ec4899', icon: 'M' },
  jordan: { name: 'Jordan', color: '#f59e0b', icon: 'J' },
  dev: { name: 'Dev', color: '#10b981', icon: 'D' },
  sam: { name: 'Sam', color: '#8b5cf6', icon: 'S' },
  luna: { name: 'Luna', color: '#06b6d4', icon: 'L' },
  iris: { name: 'Iris', color: '#f97316', icon: 'I' },
  rex: { name: 'Rex', color: '#84cc16', icon: 'R' },
  nova: { name: 'Nova', color: '#e879f9', icon: 'N' },
  pixel: { name: 'Pixel', color: '#f472b6', icon: 'P' },
  ceo: { name: 'Chief', color: '#fbbf24', icon: 'C' },
  cto: { name: 'Arch', color: '#22d3ee', icon: 'T' },
};

function toLabel(key) {
  return String(key)
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, char => char.toUpperCase());
}

function formatValue(value) {
  if (value == null || value === '') return 'n/a';
  if (Array.isArray(value)) return value.map(item => formatValue(item)).join(', ');
  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([key, nested]) => `${toLabel(key)}: ${formatValue(nested)}`)
      .join(' | ');
  }
  return String(value);
}

function parseMaybeJson(text) {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function formatStructuredSummary(text) {
  const parsed = parseMaybeJson(text);
  if (!parsed) return text || 'No summary recorded.';

  if (parsed.outputs) {
    const lines = [];
    if (parsed.task_name) lines.push(`${toLabel(parsed.task_name)}${parsed.asset_id ? ` for ${parsed.asset_id}` : ''}`);
    if (parsed.summary) lines.push(parsed.summary);

    const shotList = parsed.outputs.shot_list || [];
    if (shotList.length) {
      lines.push(`Shot list: ${shotList.slice(0, 4).map(shot => `${shot.type || 'shot'} (${shot.lens || 'lens n/a'})`).join('; ')}`);
    }

    const schedule = parsed.outputs.production_schedule || [];
    if (schedule.length) {
      lines.push(`Schedule: ${schedule.slice(0, 4).map(item => `${item.time || 'time n/a'} ${item.activity || ''}`.trim()).join('; ')}`);
    }

    const equipment = parsed.outputs.equipment || {};
    const equipmentParts = [
      equipment.cameras?.length ? `Cameras: ${equipment.cameras.join(', ')}` : '',
      equipment.lenses?.length ? `Lenses: ${equipment.lenses.slice(0, 3).join(', ')}` : '',
      equipment.drone ? `Drone: ${equipment.drone}` : '',
      equipment.audio ? `Audio: ${equipment.audio}` : '',
    ].filter(Boolean);
    if (equipmentParts.length) {
      lines.push(equipmentParts.join(' | '));
    }

    if (parsed.recommended_next_step) lines.push(`Next: ${parsed.recommended_next_step}`);
    return lines.join('\n\n');
  }

  return Object.entries(parsed)
    .map(([key, value]) => `${toLabel(key)}: ${formatValue(value)}`)
    .join('\n\n');
}

function ContextBadge({ usage }) {
  if (!usage) {
    return (
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 10px',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 100,
        fontSize: 10,
        color: '#555',
      }}>
        <span>-</span>
        <span>Awaiting receiver</span>
      </div>
    );
  }

  const pct = usage.topicPickupRate ?? usage.confidence ?? 0;
  const color = pct >= 60 ? '#10b981' : pct >= 30 ? '#f59e0b' : '#ef4444';
  const label = pct >= 60 ? 'Strong pickup' : pct >= 30 ? 'Partial pickup' : 'Weak pickup';
  const picked = usage.pickedUpTopics?.length || 0;
  const total = picked + (usage.droppedTopics?.length || 0);

  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '3px 10px',
      background: `${color}18`,
      border: `1px solid ${color}44`,
      borderRadius: 100,
      fontSize: 10,
      color,
    }}>
      <span>{pct >= 60 ? 'OK' : pct >= 30 ? 'MID' : 'LOW'}</span>
      <span>{label} {pct}%{total > 0 ? ` (${picked}/${total} topics)` : ''}</span>
    </div>
  );
}

function HandoffCard({ handoff }) {
  const [expanded, setExpanded] = useState(false);
  const fromAgent = AGENTS[handoff.from];
  const toAgent = AGENTS[handoff.to];

  return (
    <div style={{
      marginBottom: 12,
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 8,
      overflow: 'hidden',
    }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          padding: '12px 16px',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              padding: '4px 10px',
              background: `${fromAgent?.color || '#888'}22`,
              border: `1px solid ${fromAgent?.color || '#888'}44`,
              borderRadius: 100,
              fontSize: 11,
              color: fromAgent?.color || '#888',
              fontFamily: 'Orbitron, sans-serif',
            }}>
              {fromAgent?.icon || '?'} {fromAgent?.name || handoff.from}
            </span>
            <span style={{ color: '#444', fontSize: 14 }}>{'->'}</span>
            <span style={{
              padding: '4px 10px',
              background: `${toAgent?.color || '#888'}22`,
              border: `1px solid ${toAgent?.color || '#888'}44`,
              borderRadius: 100,
              fontSize: 11,
              color: toAgent?.color || '#888',
              fontFamily: 'Orbitron, sans-serif',
            }}>
              {toAgent?.icon || '?'} {toAgent?.name || handoff.to}
            </span>
          </div>
          <ContextBadge usage={handoff.usedPreviousContext} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 10, color: '#555' }}>{handoff.wordCount} words</span>
          <span style={{ fontSize: 10, color: '#444' }}>
            {handoff.timestamp ? new Date(handoff.timestamp).toLocaleTimeString() : ''}
          </span>
          <span style={{ color: '#444', fontSize: 12 }}>{expanded ? 'UP' : 'DOWN'}</span>
        </div>
      </div>

      {expanded && (
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.06)',
          padding: 16,
        }}>
          <div style={{ fontSize: 9, color: '#444', letterSpacing: '0.15em', marginBottom: 8 }}>
            HANDOFF SUMMARY
          </div>
          <div style={{
            fontSize: 12,
            color: '#aaa',
            lineHeight: 1.7,
            marginBottom: 14,
            padding: 12,
            background: 'rgba(255,255,255,0.02)',
            borderRadius: 4,
            borderLeft: `3px solid ${fromAgent?.color || '#888'}`,
            whiteSpace: 'pre-wrap',
          }}>
            {formatStructuredSummary(handoff.summary)}
          </div>

          {handoff.keyTopics?.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 9, color: '#444', letterSpacing: '0.15em', marginBottom: 8 }}>
                KEY TOPICS PASSED
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {handoff.keyTopics.map((topic, index) => (
                  <span key={index} style={{
                    padding: '3px 10px',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 100,
                    fontSize: 10,
                    color: '#888',
                  }}>
                    {topic}
                  </span>
                ))}
              </div>
            </div>
          )}

          {handoff.usedPreviousContext?.pickedUpTopics?.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 9, color: '#10b981', letterSpacing: '0.15em', marginBottom: 8 }}>
                TOPICS PICKED UP
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {handoff.usedPreviousContext.pickedUpTopics.map((topic, index) => (
                  <span key={index} style={{
                    padding: '3px 10px',
                    background: 'rgba(16,185,129,0.08)',
                    border: '1px solid rgba(16,185,129,0.2)',
                    borderRadius: 100,
                    fontSize: 10,
                    color: '#10b981',
                  }}>
                    {topic}
                  </span>
                ))}
              </div>
            </div>
          )}

          {handoff.usedPreviousContext?.droppedTopics?.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 9, color: '#ef4444', letterSpacing: '0.15em', marginBottom: 8 }}>
                TOPICS DROPPED
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {handoff.usedPreviousContext.droppedTopics.map((topic, index) => (
                  <span key={index} style={{
                    padding: '3px 10px',
                    background: 'rgba(239,68,68,0.06)',
                    border: '1px solid rgba(239,68,68,0.15)',
                    borderRadius: 100,
                    fontSize: 10,
                    color: '#ef4444',
                  }}>
                    {topic}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div>
            <div style={{ fontSize: 9, color: '#444', letterSpacing: '0.15em', marginBottom: 8 }}>
              FULL CONTENT PREVIEW
            </div>
            <div style={{
              fontSize: 11,
              color: '#666',
              lineHeight: 1.7,
              maxHeight: 150,
              overflow: 'auto',
              padding: 12,
              background: 'rgba(0,0,0,0.2)',
              borderRadius: 4,
              whiteSpace: 'pre-wrap',
            }}>
              {formatStructuredSummary(handoff.fullContent || '').substring(0, 800)}
              {formatStructuredSummary(handoff.fullContent || '').length > 800 ? '...' : ''}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CommsMonitor({ onClose }) {
  const [sessions, setSessions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const interval = setInterval(loadSessions, 3000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const loadSessions = async () => {
    try {
      const res = await fetch('/api/comms');
      if (!res.ok) throw new Error('Failed to load communications sessions');
      const data = await res.json();
      const nextSessions = Array.isArray(data) ? data : [];
      setSessions(nextSessions);
      setError(null);
      setSelected(currentSelected => {
        if (nextSessions.length === 0) return null;
        const stillExists = currentSelected && nextSessions.some(session => session.id === currentSelected);
        return stillExists ? currentSelected : nextSessions[0].id;
      });
    } catch (err) {
      setError(err.message);
      setSessions([]);
      setSelected(null);
    } finally {
      setLoading(false);
    }
  };

  const currentSession = sessions.find(session => session.id === selected);

  const getStatusColor = status => {
    if (status === 'complete') return '#10b981';
    if (status === 'running') return '#f59e0b';
    return '#ef4444';
  };

  const getContextScore = session => {
    if (!session?.handoffs?.length) return 0;
    const measured = session.handoffs.filter(handoff => handoff.usedPreviousContext);
    if (measured.length === 0) return 0;
    const total = measured.reduce((sum, handoff) => {
      return sum + (handoff.usedPreviousContext?.topicPickupRate ?? handoff.usedPreviousContext?.confidence ?? 0);
    }, 0);
    return Math.round(total / measured.length);
  };

  const buildAgentChain = handoffs => {
    const chain = [];
    if (!handoffs?.length) return chain;
    chain.push(handoffs[0].from);
    handoffs.forEach(handoff => {
      if (!chain.includes(handoff.to)) chain.push(handoff.to);
    });
    return chain;
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.88)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: 24,
    }}>
      <div style={{
        background: '#0d0d14',
        border: '1px solid rgba(0,207,255,0.3)',
        borderRadius: 4,
        width: '100%',
        maxWidth: 1000,
        maxHeight: '92vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 0 60px rgba(0,207,255,0.08)',
      }}>
        <div style={{
          padding: '14px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <div style={{
              fontFamily: 'Orbitron, sans-serif',
              fontSize: 13,
              fontWeight: 700,
              color: '#00cfff',
              letterSpacing: '0.1em',
            }}>
              AGENT COMMUNICATIONS MONITOR
            </div>
            <div style={{ fontSize: 10, color: '#444', marginTop: 2 }}>
              Track what each agent passes to the next
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              style={{
                padding: '5px 12px',
                background: autoRefresh ? 'rgba(0,207,255,0.15)' : 'transparent',
                border: `1px solid ${autoRefresh ? 'rgba(0,207,255,0.4)' : '#333'}`,
                borderRadius: 3,
                color: autoRefresh ? '#00cfff' : '#555',
                fontFamily: 'JetBrains Mono',
                fontSize: 10,
                cursor: 'pointer',
              }}
            >
              {autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
            </button>
            <button
              onClick={loadSessions}
              style={{
                padding: '5px 12px',
                background: 'transparent',
                border: '1px solid #333',
                color: '#555',
                fontFamily: 'JetBrains Mono',
                fontSize: 10,
                cursor: 'pointer',
                borderRadius: 3,
              }}
            >
              Refresh
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: '1px solid #333',
                color: '#888',
                padding: '4px 12px',
                borderRadius: 2,
                cursor: 'pointer',
                fontSize: 11,
                fontFamily: 'JetBrains Mono',
              }}
            >
              X
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <div style={{
            width: 280,
            borderRight: '1px solid rgba(255,255,255,0.06)',
            padding: 14,
            overflowY: 'auto',
            background: 'rgba(0,0,0,0.2)',
          }}>
            {error && (
              <div style={{
                marginBottom: 12,
                padding: '10px 12px',
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 4,
                color: '#ef4444',
                fontSize: 11,
                lineHeight: 1.5,
              }}>
                {error}
              </div>
            )}

            <div style={{ fontSize: 9, color: '#444', letterSpacing: '0.2em', marginBottom: 12 }}>
              PIPELINE SESSIONS ({sessions.length})
            </div>

            {loading ? (
              <div style={{ color: '#444', fontSize: 12 }}>Loading...</div>
            ) : sessions.length === 0 ? (
              <div style={{
                color: '#333',
                fontSize: 12,
                lineHeight: 1.8,
                padding: 12,
                border: '1px solid rgba(255,255,255,0.04)',
                borderRadius: 3,
              }}>
                No pipeline sessions yet. Run a pipeline first.
              </div>
            ) : (
              sessions.map(session => {
                const contextScore = getContextScore(session);
                const isSelected = selected === session.id;
                return (
                  <div
                    key={session.id}
                    onClick={() => setSelected(session.id)}
                    style={{
                      padding: '10px 12px',
                      marginBottom: 8,
                      background: isSelected ? 'rgba(0,207,255,0.08)' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${isSelected ? 'rgba(0,207,255,0.3)' : 'rgba(255,255,255,0.06)'}`,
                      borderRadius: 4,
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{
                        fontSize: 9,
                        color: getStatusColor(session.status),
                        fontFamily: 'Orbitron, sans-serif',
                        letterSpacing: '0.1em',
                      }}>
                        {session.status?.toUpperCase()}
                      </span>
                      <span style={{ fontSize: 9, color: '#444' }}>{session.duration || '...'}</span>
                    </div>
                    <div style={{
                      fontSize: 12,
                      color: isSelected ? '#e2e2e8' : '#888',
                      marginBottom: 6,
                      lineHeight: 1.4,
                    }}>
                      {session.topic?.substring(0, 40)}
                      {session.topic?.length > 40 ? '...' : ''}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 10, color: '#444' }}>{session.handoffs?.length || 0} handoffs</span>
                      <span style={{
                        fontSize: 10,
                        color: contextScore > 60 ? '#10b981' : contextScore > 30 ? '#f59e0b' : '#ef4444',
                      }}>
                        {contextScore}% context
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div style={{ flex: 1, padding: 20, overflowY: 'auto' }}>
            {!currentSession ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#333', fontSize: 12 }}>
                Select a pipeline session to inspect communications
              </div>
            ) : (
              <div>
                <div style={{
                  padding: 16,
                  marginBottom: 20,
                  background: 'rgba(0,207,255,0.05)',
                  border: '1px solid rgba(0,207,255,0.15)',
                  borderRadius: 8,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  flexWrap: 'wrap',
                  gap: 12,
                }}>
                  <div>
                    <div style={{
                      fontFamily: 'Orbitron, sans-serif',
                      fontSize: 12,
                      color: '#00cfff',
                      marginBottom: 6,
                      letterSpacing: '0.05em',
                    }}>
                      {currentSession.topic}
                    </div>
                    <div style={{ fontSize: 10, color: '#555' }}>
                      Started: {currentSession.startedAt ? new Date(currentSession.startedAt).toLocaleString() : 'Unknown'}
                      {currentSession.completedAt && (
                        <span> | Completed: {new Date(currentSession.completedAt).toLocaleString()}</span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 16 }}>
                    <SummaryStat label="HANDOFFS" value={currentSession.handoffs?.length || 0} color="#00cfff" />
                    <SummaryStat label="CONTEXT USE" value={`${getContextScore(currentSession)}%`} color={getContextScore(currentSession) > 60 ? '#10b981' : '#f59e0b'} />
                    <SummaryStat label="DURATION" value={currentSession.duration || '...'} color={getStatusColor(currentSession.status)} />
                  </div>
                </div>

                {buildAgentChain(currentSession.handoffs || []).length > 0 && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    marginBottom: 24,
                    padding: '12px 16px',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 8,
                    overflowX: 'auto',
                    gap: 4,
                  }}>
                    {buildAgentChain(currentSession.handoffs || []).map((id, index, chain) => {
                      const agent = AGENTS[id] || { name: id, color: '#888', icon: '?' };
                      const handoff = (currentSession.handoffs || []).find(item => item.from === id);
                      const pct = handoff?.usedPreviousContext?.topicPickupRate ?? handoff?.usedPreviousContext?.confidence ?? null;
                      return (
                        <div key={id} style={{ display: 'flex', alignItems: 'center' }}>
                          <div style={{
                            textAlign: 'center',
                            padding: '8px 14px',
                            background: `${agent.color}18`,
                            border: `1px solid ${agent.color}44`,
                            borderRadius: 6,
                          }}>
                            <div style={{ fontSize: 20 }}>{agent.icon}</div>
                            <div style={{
                              fontFamily: 'Orbitron, sans-serif',
                              fontSize: 9,
                              fontWeight: 700,
                              color: agent.color,
                              marginTop: 4,
                            }}>
                              {agent.name}
                            </div>
                            {handoff && (
                              <div style={{ fontSize: 9, color: '#555', marginTop: 2 }}>
                                {handoff.wordCount}w
                              </div>
                            )}
                          </div>
                          {index < chain.length - 1 && (
                            <div style={{
                              padding: '0 6px',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              gap: 2,
                            }}>
                              <div style={{ color: '#333', fontSize: 16 }}>{'->'}</div>
                              {pct !== null && (
                                <div style={{
                                  fontSize: 8,
                                  fontWeight: 700,
                                  color: pct >= 60 ? '#10b981' : pct >= 30 ? '#f59e0b' : '#ef4444',
                                }}>
                                  {pct}%
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div style={{
                  padding: '8px 14px',
                  marginBottom: 20,
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.04)',
                  borderRadius: 6,
                  fontSize: 10,
                  color: '#555',
                  display: 'flex',
                  gap: 20,
                  flexWrap: 'wrap',
                }}>
                  <span>Context use % shows how much the next agent picked up from the prior handoff.</span>
                  <span style={{ color: '#10b981' }}>60%+ Strong</span>
                  <span style={{ color: '#f59e0b' }}>30-60% Partial</span>
                  <span style={{ color: '#ef4444' }}>0-30% Weak</span>
                </div>

                <div style={{ fontSize: 9, color: '#444', letterSpacing: '0.2em', marginBottom: 12 }}>
                  HANDOFF DETAILS
                </div>

                {currentSession.handoffs?.length > 0 ? (
                  currentSession.handoffs.map((handoff, index) => (
                    <HandoffCard key={`${handoff.from}-${handoff.to}-${index}`} handoff={handoff} />
                  ))
                ) : (
                  <div style={{ color: '#444', fontSize: 12 }}>
                    No handoffs recorded for this session.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryStat({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 22,
        fontWeight: 800,
        color,
      }}>
        {value}
      </div>
      <div style={{ fontSize: 9, color: '#444' }}>{label}</div>
    </div>
  );
}
