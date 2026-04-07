'use client';
import { useState, useEffect } from 'react';

const STATUS_COLORS = {
  running: '#10b981',
  stopping: '#f59e0b',
  stopped: '#ef4444',
  killed: '#ef4444',
  complete: '#3b82f6',
  error: '#ef4444',
};

const TYPE_ICONS = {
  pipeline: '⚡',
  agent: '🤖',
  reflect: '🧠',
  landingpage: '🌐',
};

export default function ProcessManager({ onClose, onStopAgent, onReopen }) {
  const [processes, setProcesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadProcesses();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(loadProcesses, 2000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const loadProcesses = async () => {
    try {
      const res = await fetch('/api/processes');
      if (!res.ok) throw new Error('Failed to load processes');
      const data = await res.json();
      setProcesses(Array.isArray(data) ? data : []);
      setError('');
    } catch (e) {
      console.error('Processes error:', e);
      setError(e.message);
      setProcesses([]);
    } finally {
      setLoading(false);
    }
  };

  const mutateProcesses = async (body) => {
    const res = await fetch('/api/processes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Process action failed');
    setError('');
    await loadProcesses();
    return data;
  };

  const stopProcess = async (id) => {
    try {
      await mutateProcesses({ action: 'stop', processId: id });
    } catch (e) {
      setError(e.message);
    }
  };

  const forceKill = async (id) => {
    try {
      await mutateProcesses({ action: 'forceKill', processId: id });
    } catch (e) {
      setError(e.message);
    }
  };

  const stopAll = async () => {
    try {
      await mutateProcesses({ action: 'stopAll' });
    } catch (e) {
      setError(e.message);
    }
  };

  const forceKillAll = async () => {
    try {
      await mutateProcesses({ action: 'forceKillAll' });
    } catch (e) {
      setError(e.message);
    }
  };

  const clearAll = async () => {
    try {
      await mutateProcesses({ action: 'clearAll' });
    } catch (e) {
      setError(e.message);
    }
  };

  const running = processes.filter(p => p.status === 'running');
  const stopping = processes.filter(p => p.status === 'stopping');
  const finished = processes.filter(p => p.status !== 'running' && p.status !== 'stopping');

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 24,
    }}>
      <div style={{
        background: '#0d0d14',
        border: '1px solid rgba(245,158,11,0.3)',
        borderRadius: 4, width: '100%', maxWidth: 700,
        maxHeight: '85vh', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 0 60px rgba(245,158,11,0.08)',
      }}>

        {/* Header */}
        <div style={{
          padding: '14px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{
              fontFamily: 'Orbitron, sans-serif', fontSize: 13,
              fontWeight: 700, color: '#f59e0b', letterSpacing: '0.1em',
            }}>⚙ PROCESS MANAGER</div>
            <div style={{ fontSize: 10, color: '#444', marginTop: 2 }}>
              {running.length} running · {finished.length} completed · auto-refreshing every 2s
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              style={{
                padding: '5px 12px',
                background: autoRefresh ? 'rgba(16,185,129,0.15)' : 'transparent',
                border: '1px solid ' + (autoRefresh ? 'rgba(16,185,129,0.4)' : '#333'),
                borderRadius: 3,
                color: autoRefresh ? '#10b981' : '#555',
                fontFamily: 'JetBrains Mono', fontSize: 10, cursor: 'pointer',
              }}
            >{autoRefresh ? '⟳ Live' : '⟳ Paused'}</button>
            <button onClick={clearAll} style={{
              padding: '5px 12px', background: 'transparent',
              border: '1px solid #333', borderRadius: 3, color: '#555',
              fontFamily: 'JetBrains Mono', fontSize: 10, cursor: 'pointer',
            }}>🗑 Clear</button>
            {(running.length > 0 || stopping.length > 0) && (
              <button onClick={forceKillAll} style={{
                padding: '5px 12px',
                background: 'rgba(239,68,68,0.15)',
                border: '1px solid rgba(239,68,68,0.4)',
                borderRadius: 3, color: '#ef4444',
                fontFamily: 'Orbitron, sans-serif',
                fontSize: 9, letterSpacing: '0.1em', cursor: 'pointer',
              }}>✕ KILL ALL</button>
            )}
            <button onClick={onClose} style={{
              background: 'transparent', border: '1px solid #333',
              color: '#888', padding: '4px 12px', borderRadius: 2,
              cursor: 'pointer', fontSize: 11, fontFamily: 'JetBrains Mono',
            }}>✕</button>
          </div>
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

        {/* Stats bar */}
        <div style={{
          display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          {[
            { label: 'RUNNING', value: running.length, color: '#10b981' },
            { label: 'STOPPING', value: stopping.length, color: '#f59e0b' },
            { label: 'COMPLETE', value: finished.filter(p => p.status === 'complete').length, color: '#3b82f6' },
            { label: 'TOTAL', value: processes.length, color: '#444' },
          ].map(s => (
            <div key={s.label} style={{
              flex: 1, padding: '10px 0', textAlign: 'center',
              borderRight: '1px solid rgba(255,255,255,0.04)',
            }}>
              <div style={{
                fontFamily: 'Orbitron, sans-serif', fontSize: 20,
                fontWeight: 800, color: s.color,
              }}>{s.value}</div>
              <div style={{ fontSize: 9, color: '#444', letterSpacing: '0.1em' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Process list */}
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          {loading ? (
            <div style={{ color: '#444', fontSize: 12, textAlign: 'center', padding: 40 }}>
              Loading processes...
            </div>
          ) : processes.length === 0 ? (
            <div style={{
              color: '#333', fontSize: 12, textAlign: 'center',
              padding: 40, lineHeight: 1.8,
            }}>
              No processes recorded yet.<br />
              Run a pipeline or send a message to an agent.
            </div>
          ) : (
            <div>
              {/* Running */}
              {running.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 9, color: '#10b981', letterSpacing: '0.2em', marginBottom: 10 }}>
                    ● ACTIVE — {running.length} running
                  </div>
                  {running.map(p => (
                    <ProcessRow key={p.id} process={p} onStop={stopProcess} onForceKill={forceKill} onReopen={onReopen} />
                  ))}
                </div>
              )}

              {/* Stopping */}
              {stopping.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 9, color: '#f59e0b', letterSpacing: '0.2em', marginBottom: 10 }}>
                    ⟳ STOPPING
                  </div>
                  {stopping.map(p => (
                    <ProcessRow key={p.id} process={p} onStop={stopProcess} onForceKill={forceKill} onReopen={onReopen} />
                  ))}
                </div>
              )}

              {/* History */}
              {finished.length > 0 && (
                <div>
                  <div style={{ fontSize: 9, color: '#444', letterSpacing: '0.2em', marginBottom: 10 }}>
                    HISTORY — {finished.length} completed
                  </div>
                  {finished.slice(0, 15).map(p => (
                    <ProcessRow key={p.id} process={p} onStop={stopProcess} onForceKill={forceKill} onReopen={onReopen} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProcessRow({ process, onStop, onForceKill, onReopen }) {
  const statusColor = STATUS_COLORS[process.status] || '#555';
  const icon = TYPE_ICONS[process.type] || '⚙';
  const isActive = process.status === 'running';
  const isStopping = process.status === 'stopping';
  const canResume = !isActive && !isStopping && process.type === 'pipeline' && process.pipelineTopic &&
    (process.status === 'stopped' || process.status === 'killed' || process.status === 'failed');

  const startTime = process.startedAt ? new Date(process.startedAt) : null;
  const endTime = process.completedAt ? new Date(process.completedAt) :
                  process.killedAt ? new Date(process.killedAt) :
                  process.stoppedAt ? new Date(process.stoppedAt) : null;
  const duration = startTime && endTime
    ? Math.round((endTime - startTime) / 1000) + 's'
    : startTime
    ? Math.round((new Date() - startTime) / 1000) + 's elapsed'
    : '';

  return (
    <div style={{
      padding: '12px 14px', marginBottom: 8,
      background: isActive ? 'rgba(16,185,129,0.06)' :
                  isStopping ? 'rgba(245,158,11,0.06)' :
                  'rgba(255,255,255,0.02)',
      border: '1px solid ' + (isActive ? 'rgba(16,185,129,0.25)' :
                               isStopping ? 'rgba(245,158,11,0.25)' :
                               'rgba(255,255,255,0.06)'),
      borderRadius: 6,
      display: 'flex', justifyContent: 'space-between',
      alignItems: 'center', gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: statusColor, flexShrink: 0,
          boxShadow: isActive ? '0 0 6px ' + statusColor : 'none',
        }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: '#ccc', marginBottom: 3 }}>
            {icon} {process.description}
          </div>
          <div style={{ fontSize: 9, color: '#444', display: 'flex', gap: 12 }}>
            <span style={{ color: statusColor, fontWeight: 700 }}>
              {process.status.toUpperCase()}
            </span>
            {duration && <span>⏱ {duration}</span>}
            {process.completedStepIndex > 0 && canResume && (
              <span style={{ color: '#10b981' }}>Step {process.completedStepIndex} done</span>
            )}
            {startTime && (
              <span>Started {startTime.toLocaleTimeString()}</span>
            )}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        {(isActive || isStopping) && onReopen && (
          <button onClick={() => onReopen(process)} style={{
            background: 'rgba(139,92,246,0.12)',
            border: '1px solid rgba(139,92,246,0.35)',
            color: '#a78bfa', padding: '4px 10px',
            borderRadius: 3, cursor: 'pointer',
            fontSize: 9, fontFamily: 'Orbitron, sans-serif',
          }}>↩ REOPEN</button>
        )}
        {canResume && onReopen && (
          <button onClick={() => onReopen(process)} style={{
            background: 'rgba(16,185,129,0.12)',
            border: '1px solid rgba(16,185,129,0.35)',
            color: '#10b981', padding: '4px 10px',
            borderRadius: 3, cursor: 'pointer',
            fontSize: 9, fontFamily: 'Orbitron, sans-serif',
          }}>▶ RESUME</button>
        )}
        {isActive && (
          <button onClick={() => onStop(process.id)} style={{
            background: 'rgba(245,158,11,0.1)',
            border: '1px solid rgba(245,158,11,0.3)',
            color: '#f59e0b', padding: '4px 10px',
            borderRadius: 3, cursor: 'pointer',
            fontSize: 9, fontFamily: 'Orbitron, sans-serif',
          }}>⏸ STOP</button>
        )}
        {(isActive || isStopping) && (
          <button onClick={() => onForceKill(process.id)} style={{
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            color: '#ef4444', padding: '4px 10px',
            borderRadius: 3, cursor: 'pointer',
            fontSize: 9, fontFamily: 'Orbitron, sans-serif',
          }}>✕ KILL</button>
        )}
      </div>
    </div>
  );
}
