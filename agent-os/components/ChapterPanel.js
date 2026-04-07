'use client';
import { useState, useEffect } from 'react';

const TEAM = {
  jack: { name: 'Jack Riggs', color: '#f59e0b', icon: '⚡', role: 'Founder' },
  jake: { name: 'Jake Evans', color: '#3b82f6', icon: '🎯', role: 'Operations' },
  team: { name: 'OTG Team', color: '#10b981', icon: '🌟', role: 'General' },
};

export default function ChapterPanel({ onClose }) {
  const [view, setView] = useState('checkin');
  const [selectedMember, setSelectedMember] = useState(null);
  const [goals, setGoals] = useState('');
  const [notes, setNotes] = useState('');
  const [nextSteps, setNextSteps] = useState('');
  const [activeSession, setActiveSession] = useState(null);
  const [report, setReport] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [activeRes, chaptersRes] = await Promise.all([
        fetch('/api/chapters?action=active'),
        fetch('/api/chapters?action=chapters'),
      ]);
      if (!activeRes.ok) throw new Error('Failed to load active chapter session');
      if (!chaptersRes.ok) throw new Error('Failed to load chapter history');
      const active = await activeRes.json();
      const chaps = await chaptersRes.json();
      setActiveSession(active);
      setChapters(Array.isArray(chaps) ? chaps : []);
      setError('');
      if (active) setView('active');
    } catch (err) {
      setError(err.message);
      setActiveSession(null);
      setChapters([]);
    }
  };

  const startSession = async () => {
    if (!selectedMember) return;
    setLoading(true);
    try {
      const res = await fetch('/api/chapters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', memberId: selectedMember, goals }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to start session');
      }
      const data = await res.json();
      setActiveSession(data.session);
      setView('active');
      setError('');
    } catch (err) {
      setError(err.message);
    }
    finally { setLoading(false); }
  };

  const closeSession = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/chapters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'close', notes, nextSteps }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to close session');
      }
      setActiveSession(null);
      setNotes('');
      setNextSteps('');
      setView('history');
      setError('');
      loadData();
    } catch (err) {
      setError(err.message);
    }
    finally { setLoading(false); }
  };

  const getReport = async (memberId) => {
    setReportLoading(true);
    setReport(null);
    try {
      const res = await fetch('/api/chapters?action=report&memberId=' + memberId);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to generate briefing');
      }
      const data = await res.json();
      setReport(data);
      setView('report');
      setError('');
    } catch (err) {
      setError(err.message);
    }
    finally { setReportLoading(false); }
  };

  const inputStyle = {
    width: '100%', background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 3, color: '#e2e2e8', padding: '8px 12px',
    fontSize: 12, fontFamily: 'JetBrains Mono',
    outline: 'none', marginBottom: 8,
  };

  const member = activeSession ? TEAM[activeSession.memberId] : null;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 24,
    }}>
      <div style={{
        background: '#0d0d14',
        border: '1px solid rgba(245,158,11,0.3)',
        borderRadius: 4, width: '100%', maxWidth: 780,
        maxHeight: '90vh', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 0 60px rgba(245,158,11,0.08)',
      }}>

        {/* Header */}
        <div style={{
          padding: '14px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div>
              <div style={{
                fontFamily: 'Orbitron, sans-serif', fontSize: 13,
                fontWeight: 700, color: '#f59e0b', letterSpacing: '0.1em',
              }}>📖 OTG CHAPTER LOG</div>
              <div style={{ fontSize: 10, color: '#444', marginTop: 2 }}>
                {chapters.length} chapters · {activeSession ? '🟢 Session active' : '⚪ No active session'}
              </div>
            </div>
            {activeSession && member && (
              <div style={{
                padding: '4px 12px',
                background: member.color + '18',
                border: '1px solid ' + member.color + '44',
                borderRadius: 100, fontSize: 10,
                color: member.color,
                fontFamily: 'Orbitron, sans-serif',
              }}>
                {member.icon} {member.name} working
              </div>
            )}
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: '1px solid #333',
            color: '#888', padding: '4px 12px', borderRadius: 2,
            cursor: 'pointer', fontSize: 11, fontFamily: 'JetBrains Mono',
          }}>✕</button>
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

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {[
            { id: 'checkin', label: activeSession ? '⏸ Close Session' : '▶ Check In' },
            { id: 'active', label: '🟢 Active', disabled: !activeSession },
            { id: 'report', label: '📋 Get Briefed' },
            { id: 'history', label: '📖 History' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => !tab.disabled && setView(tab.id)}
              style={{
                flex: 1, padding: '10px 0',
                background: view === tab.id ? 'rgba(245,158,11,0.1)' : 'transparent',
                border: 'none',
                borderBottom: view === tab.id ? '2px solid #f59e0b' : '2px solid transparent',
                color: tab.disabled ? '#333' : view === tab.id ? '#f59e0b' : '#555',
                fontFamily: 'Orbitron, sans-serif', fontSize: 9,
                letterSpacing: '0.1em', cursor: tab.disabled ? 'not-allowed' : 'pointer',
                textTransform: 'uppercase',
              }}
            >{tab.label}</button>
          ))}
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>

          {/* Check In / Close Session */}
          {view === 'checkin' && (
            <div>
              {activeSession ? (
                <div>
                  <div style={{
                    padding: 16, marginBottom: 20,
                    background: 'rgba(245,158,11,0.06)',
                    border: '1px solid rgba(245,158,11,0.2)',
                    borderRadius: 6,
                  }}>
                    <div style={{
                      fontFamily: 'Orbitron, sans-serif', fontSize: 11,
                      color: '#f59e0b', marginBottom: 8,
                    }}>ACTIVE SESSION — {TEAM[activeSession.memberId]?.name}</div>
                    <div style={{ fontSize: 11, color: '#888' }}>
                      Started: {new Date(activeSession.startedAt).toLocaleString()}
                    </div>
                    {activeSession.goals && (
                      <div style={{ fontSize: 11, color: '#ccc', marginTop: 6 }}>
                        Goals: {activeSession.goals}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: '#555', marginTop: 6 }}>
                      {activeSession.accomplishments?.length || 0} accomplishments logged
                    </div>
                  </div>

                  <div style={{ fontSize: 11, color: '#555', marginBottom: 16 }}>
                    Close this session to save a chapter. Future team members will see this as a progress entry.
                  </div>

                  <label style={{ fontSize: 9, color: '#666', letterSpacing: '0.15em', display: 'block', marginBottom: 4 }}>
                    WHAT DID YOU ACCOMPLISH THIS SESSION?
                  </label>
                  <textarea style={{ ...inputStyle, height: 90, resize: 'vertical' }}
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Ran full pipeline on real estate niche, built landing page for OTG, set up GHL sub-account for wedding client..."
                  />

                  <label style={{ fontSize: 9, color: '#666', letterSpacing: '0.15em', display: 'block', marginBottom: 4 }}>
                    WHAT NEEDS TO HAPPEN NEXT?
                  </label>
                  <textarea style={{ ...inputStyle, height: 70, resize: 'vertical' }}
                    value={nextSteps}
                    onChange={e => setNextSteps(e.target.value)}
                    placeholder="Need to connect ManyChat to GHL, finish Luna agent testing, run pipeline for music video niche..."
                  />

                  <button onClick={closeSession} disabled={loading} style={{
                    width: '100%', padding: '12px 0',
                    background: loading ? 'rgba(245,158,11,0.08)' : 'rgba(245,158,11,0.18)',
                    border: '1px solid rgba(245,158,11,0.4)',
                    borderRadius: 3, color: '#f59e0b',
                    fontFamily: 'Orbitron, sans-serif',
                    fontSize: 11, letterSpacing: '0.1em',
                    cursor: loading ? 'not-allowed' : 'pointer',
                  }}>
                    {loading ? '⟳ Saving chapter...' : '📖 CLOSE SESSION & SAVE CHAPTER'}
                  </button>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 11, color: '#555', marginBottom: 20, lineHeight: 1.7 }}>
                    Who is starting a session? This helps track progress and gives teammates a briefing when they return.
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr'
, gap: 12, marginBottom: 20 }}>
                    {Object.entries(TEAM).map(([id, m]) => (
                      <div
                        key={id}
                        onClick={() => setSelectedMember(id)}
                        style={{
                          padding: 16, textAlign: 'center', cursor: 'pointer',
                          background: selectedMember === id ? m.color + '18' : 'rgba(255,255,255,0.02)',
                          border: '1px solid ' + (selectedMember === id ? m.color + '55' : 'rgba(255,255,255,0.06)'),
                          borderRadius: 6, transition: 'all 0.2s',
                        }}
                      >
                        <div style={{ fontSize: 28, marginBottom: 8 }}>{m.icon}</div>
                        <div style={{
                          fontFamily: 'Orbitron, sans-serif', fontSize: 11,
                          fontWeight: 700,
                          color: selectedMember === id ? m.color : '#888',
                        }}>{m.name}</div>
                        <div style={{ fontSize: 10, color: '#444', marginTop: 4 }}>{m.role}</div>
                      </div>
                    ))}
                  </div>

                  {selectedMember && (
                    <div>
                      <label style={{ fontSize: 9, color: '#666', letterSpacing: '0.15em', display: 'block', marginBottom: 4 }}>
                        WHAT ARE YOU WORKING ON TODAY? (optional)
                      </label>
                      <textarea
                        style={{ ...inputStyle, height: 70, resize: 'vertical' }}
                        value={goals}
                        onChange={e => setGoals(e.target.value)}
                        placeholder="Building the music video pipeline, testing Luna for lead qualification, setting up new client in GHL..."
                      />

                      <button onClick={startSession} disabled={loading} style={{
                        width: '100%', padding: '12px 0',
                        background: loading ? 'rgba(245,158,11,0.08)' : 'rgba(245,158,11,0.18)',
                        border: '1px solid rgba(245,158,11,0.4)',
                        borderRadius: 3, color: '#f59e0b',
                        fontFamily: 'Orbitron, sans-serif',
                        fontSize: 11, letterSpacing: '0.1em',
                        cursor: loading ? 'not-allowed' : 'pointer',
                      }}>
                        {loading ? '⟳ Starting...' : '▶ START SESSION AS ' + TEAM[selectedMember]?.name?.toUpperCase()}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Active Session View */}
          {view === 'active' && activeSession && (
            <div>
              <div style={{
                padding: 16, marginBottom: 20,
                background: 'rgba(16,185,129,0.06)',
                border: '1px solid rgba(16,185,129,0.2)',
                borderRadius: 6,
              }}>
                <div style={{
                  fontFamily: 'Orbitron, sans-serif', fontSize: 11,
                  color: '#10b981', marginBottom: 8, letterSpacing: '0.1em',
                }}>🟢 {TEAM[activeSession.memberId]?.name?.toUpperCase()} IS WORKING</div>
                <div style={{ fontSize: 11, color: '#888' }}>
                  Started: {new Date(activeSession.startedAt).toLocaleString()}
                </div>
                {activeSession.goals && (
                  <div style={{ fontSize: 11, color: '#ccc', marginTop: 6, lineHeight: 1.6 }}>
                    Goals: {activeSession.goals}
                  </div>
                )}
              </div>

              <div style={{ fontSize: 9, color: '#444', letterSpacing: '0.2em', marginBottom: 12 }}>
                ACCOMPLISHMENTS THIS SESSION ({activeSession.accomplishments?.length || 0})
              </div>

              {activeSession.accomplishments?.length > 0 ? (
                activeSession.accomplishments.map((a, i) => (
                  <div key={i} style={{
                    padding: '8px 12px', marginBottom: 6,
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 4, fontSize: 11, color: '#ccc',
                  }}>
                    ✓ {a.description}
                    <span style={{ fontSize: 9, color: '#444', marginLeft: 8 }}>
                      {new Date(a.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))
              ) : (
                <div style={{ color: '#333', fontSize: 12 }}>
                  Accomplishments are logged automatically as you use agents and run pipelines.
                </div>
              )}

              {activeSession.pipelinesRun?.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 9, color: '#444', letterSpacing: '0.2em', marginBottom: 12 }}>
                    PIPELINES RUN ({activeSession.pipelinesRun.length})
                  </div>
                  {activeSession.pipelinesRun.map((p, i) => (
                    <div key={i} style={{
                      padding: '8px 12px', marginBottom: 6,
                      background: 'rgba(245,158,11,0.06)',
                      border: '1px solid rgba(245,158,11,0.2)',
                      borderRadius: 4, fontSize: 11, color: '#f59e0b',
                    }}>
                      ⚡ {p.topic}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Get Briefed */}
          {view === 'report' && (
            <div>
              {!report && !reportLoading && (
                <div>
                  <div style={{ fontSize: 11, color: '#555', marginBottom: 20, lineHeight: 1.7 }}>
                    Who are you? We'll generate a personalized briefing showing what happened while you were away and what needs your attention next.
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr'
, gap: 12 }}>
                    {Object.entries(TEAM).map(([id, m]) => (
                      <div
                        key={id}
                        onClick={() => getReport(id)}
                        style={{
                          padding: 20, textAlign: 'center', cursor: 'pointer',
                          background: 'rgba(255,255,255,0.02)',
                          border: '1px solid rgba(255,255,255,0.06)',
                          borderRadius: 6, transition: 'all 0.2s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = m.color + '55'; e.currentTarget.style.background = m.color + '10'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                      >
                        <div style={{ fontSize: 32, marginBottom: 10 }}>{m.icon}</div>
                        <div style={{
                          fontFamily: 'Orbitron, sans-serif', fontSize: 11,
                          fontWeight: 700, color: m.color,
                        }}>I am {m.name}</div>
                        <div style={{ fontSize: 10, color: '#555', marginTop: 4 }}>Get my briefing</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {reportLoading && (
                <div style={{ textAlign: 'center', padding: 60, color: '#f59e0b', fontSize: 12 }}>
                  ⟳ Generating your personalized briefing...
                  <div style={{ fontSize: 10, color: '#444', marginTop: 8 }}>
                    AI is reviewing recent chapters and preparing your update
                  </div>
                </div>
              )}

              {report && !reportLoading && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <div style={{
                      fontFamily: 'Orbitron, sans-serif', fontSize: 12,
                      color: '#f59e0b', letterSpacing: '0.1em',
                    }}>YOUR PROGRESS BRIEFING</div>
                    <button onClick={() => { setReport(null); }} style={{
                      background: 'transparent', border: '1px solid #333',
                      color: '#555', padding: '4px 10px', borderRadius: 2,
                      cursor: 'pointer', fontSize: 10, fontFamily: 'JetBrains Mono',
                    }}>← Back</button>
                  </div>

                  {report.aiBriefing && (
                    <div style={{
                      padding: 16, marginBottom: 20,
                      background: 'rgba(245,158,11,0.06)',
                      border: '1px solid rgba(245,158,11,0.2)',
                      borderRadius: 6, fontSize: 13,
                      color: '#e2e2e8', lineHeight: 1.8,
                    }}>
                      {report.aiBriefing}
                    </div>
                  )}

                  {report.chaptersWhileAway?.length > 0 && (
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ fontSize: 9, color: '#3b82f6', letterSpacing: '0.2em', marginBottom: 10 }}>
                        WHAT HAPPENED WHILE YOU WERE AWAY ({report.chaptersWhileAway.length} chapters)
                      </div>
                      {report.chaptersWhileAway.slice(0, 5).map((c, i) => (
                        <div key={i} style={{
                          padding: '10px 14px', marginBottom: 8,
                          background: 'rgba(59,130,246,0.06)',
                          border: '1px solid rgba(59,130,246,0.15)',
                          borderRadius: 4,
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                            <span style={{
                              fontSize: 11, fontWeight: 700,
                              color: TEAM[c.memberId]?.color || '#888',
                            }}>
                              {TEAM[c.memberId]?.icon} {c.memberName}
                            </span>
                            <span style={{ fontSize: 9, color: '#444' }}>
                              {c.duration} · {new Date(c.startedAt).toLocaleDateString()}
                            </span>
                          </div>
                          {c.accomplishments?.slice(0, 3).map((a, j) => (
                            <div key={j} style={{ fontSize: 11, color: '#888', lineHeight: 1.5 }}>
                              ✓ {a.description}
                            </div>
                          ))}
                          {c.nextSteps && (
                            <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 6 }}>
                              → Left for you: {c.nextSteps}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {report.chaptersWhileAway?.length === 0 && (
                    <div style={{
                      padding: 16, color: '#333', fontSize: 12,
                      border: '1px solid rgba(255,255,255,0.04)', borderRadius: 4,
                    }}>
                      Nothing happened while you were away. You are fully up to date.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* History */}
          {view === 'history' && (
            <div>
              <div style={{ fontSize: 9, color: '#444', letterSpacing: '0.2em', marginBottom: 16 }}>
                ALL CHAPTERS ({chapters.length})
              </div>
              {chapters.length === 0 ? (
                <div style={{ color: '#333', fontSize: 12, textAlign: 'center', padding: 40 }}>
                  No chapters yet. Start a session and close it to create your first chapter.
                </div>
              ) : (
                chapters.map((c, i) => {
                  const m = TEAM[c.memberId];
                  return (
                    <div key={i} style={{
                      padding: '14px 16px', marginBottom: 10,
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: 6,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{
                            fontFamily: 'Orbitron, sans-serif', fontSize: 11,
                            color: '#444',
                          }}>CH.{c.number}</div>
                          <span style={{
                            padding: '2px 10px',
                            background: (m?.color || '#888') + '18',
                            border: '1px solid ' + (m?.color || '#888') + '33',
                            borderRadius: 100, fontSize: 10,
                            color: m?.color || '#888',
                          }}>
                            {m?.icon} {c.memberName}
                          </span>
                        </div>
                        <div style={{ fontSize: 9, color: '#444', textAlign: 'right' }}>
                          <div>{new Date(c.startedAt).toLocaleDateString()}</div>
                          <div>{c.duration}</div>
                        </div>
                      </div>

                      {c.goals && (
                        <div style={{ fontSize: 11, color: '#666', marginBottom: 6 }}>
                          Goals: {c.goals}
                        </div>
                      )}

                      {c.accomplishments?.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          {c.accomplishments.slice(0, 3).map((a, j) => (
                            <div key={j} style={{ fontSize: 11, color: '#888', lineHeight: 1.6 }}>
                              ✓ {a.description}
                            </div>
                          ))}
                          {c.accomplishments.length > 3 && (
                            <div style={{ fontSize: 10, color: '#444' }}>
                              +{c.accomplishments.length - 3} more
                            </div>
                          )}
                        </div>
                      )}

                      {c.nextSteps && (
                        <div style={{
                          marginTop: 8, padding: '6px 10px',
                          background: 'rgba(245,158,11,0.06)',
                          border: '1px solid rgba(245,158,11,0.15)',
                          borderRadius: 3, fontSize: 11, color: '#f59e0b',
                        }}>
                          → Next: {c.nextSteps}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
