'use client';

import { useEffect, useRef, useState } from 'react';
import { formatAgentOutputForDisplay } from '../lib/pipelineReports';

function getPipelineStepsMap(pipelineType, pipelineTypes) {
  const selected = pipelineTypes?.[pipelineType] || pipelineTypes?.content;
  return (selected?.steps || []).map((step) =>
    typeof step === 'string'
      ? { agentId: step, label: step, description: '' }
      : { agentId: step.agentId, label: step.label || step.agentId, description: step.description || '' }
  );
}

function outputCardStyle(agentColor, isMobile, maxHeight) {
  return {
    background: 'linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.015))',
    border: '1px solid ' + (agentColor || '#666') + '26',
    borderRadius: 16,
    padding: isMobile ? 14 : 16,
    fontSize: 12,
    color: '#d1d5de',
    lineHeight: 1.75,
    whiteSpace: 'pre-wrap',
    overflow: 'auto',
    WebkitOverflowScrolling: 'touch',
    overscrollBehavior: 'contain',
    maxHeight,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
  };
}

export default function AuraPipelineModal({
  pipeline,
  agents,
  onClose,
  onStop,
  streamingTokens,
  onMinimize,
  pipelineTypes,
  onOpenLandingPage,
  onOpenGhlPages,
  onOpenPipelineReports,
}) {
  const [viewportWidth, setViewportWidth] = useState(1280);
  const liveOutputRef = useRef(null);
  const visibleSteps = getPipelineStepsMap(pipeline?.pipelineType, pipelineTypes);
  const completedCount = visibleSteps.filter((step) => pipeline?.steps?.[step.agentId]?.status === 'complete').length;
  const currentAgent = agents?.[pipeline?.currentStep];
  const latestHandoff = (pipeline?.handoffs || []).length ? pipeline.handoffs[pipeline.handoffs.length - 1] : null;
  const isMobile = viewportWidth <= 900;
  const compactTopic = typeof pipeline?.topic === 'string' ? pipeline.topic.trim() : '';
  const liveStreamText = pipeline?.currentStep ? streamingTokens?.[pipeline.currentStep] : '';
  const runStateTone =
    pipeline?.status === 'complete' ? '#10b981' :
    pipeline?.status === 'running' ? '#f59e0b' :
    pipeline?.status === 'stopping' ? '#f59e0b' :
    '#ef4444';

  useEffect(() => {
    const updateViewport = () => setViewportWidth(window.innerWidth);
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  useEffect(() => {
    const scrollY = window.scrollY;
    const originalBodyOverflow = document.body.style.overflow;
    const originalBodyPosition = document.body.style.position;
    const originalBodyTop = document.body.style.top;
    const originalBodyWidth = document.body.style.width;
    const originalHtmlOverflow = document.documentElement.style.overflow;
    // iOS Safari needs both html/body lock + fixed body to prevent background scroll bleed.
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';

    return () => {
      document.documentElement.style.overflow = originalHtmlOverflow;
      document.body.style.overflow = originalBodyOverflow;
      document.body.style.position = originalBodyPosition;
      document.body.style.top = originalBodyTop;
      document.body.style.width = originalBodyWidth;
      window.scrollTo(0, scrollY);
    };
  }, []);

  useEffect(() => {
    if (!liveOutputRef.current) return;
    liveOutputRef.current.scrollTop = liveOutputRef.current.scrollHeight;
  }, [liveStreamText, pipeline?.currentStep]);
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(3,4,8,0.9)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: isMobile ? 10 : 24,
        overscrollBehavior: 'contain',
      }}
    >
      <div
        style={{
          background: 'linear-gradient(180deg, rgba(13,13,20,0.98), rgba(8,9,14,0.98))',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: isMobile ? 14 : 16,
          width: '100%',
          maxWidth: 1120,
          maxHeight: isMobile ? 'calc(100vh - 20px)' : '90vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 40px 120px rgba(0,0,0,0.55)',
        }}
      >
        <div
          style={{
            padding: isMobile ? '18px 16px 14px' : '16px 20px 14px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.25fr) minmax(280px, 0.9fr) auto',
            gap: isMobile ? 14 : 14,
            alignItems: isMobile ? 'stretch' : 'center',
            background:
              'radial-gradient(circle at top left, rgba(245,158,11,0.16), transparent 35%), radial-gradient(circle at top right, rgba(139,92,246,0.12), transparent 32%)',
          }}
        >
          <div>
            <div
              style={{
                fontFamily: 'Orbitron, sans-serif',
                fontSize: 11,
                fontWeight: 700,
                color: runStateTone,
                letterSpacing: '0.16em',
              }}
            >
              PIPELINE EXECUTION
            </div>
            <div
              style={{
                fontSize: isMobile ? 20 : 18,
                color: '#f5f5f7',
                marginTop: 8,
                fontWeight: 700,
                lineHeight: isMobile ? 1.12 : 1.3,
                maxWidth: isMobile ? '100%' : 620,
                display: '-webkit-box',
                WebkitLineClamp: isMobile ? 3 : 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={compactTopic}
            >
              {compactTopic}
            </div>
            <div style={{ fontSize: 12, color: '#8d90a1', marginTop: 10, lineHeight: 1.6, maxWidth: 620 }}>
              Agent OS is coordinating the run, preserving handoffs, and carrying outputs into the operating system.
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: isMobile ? 8 : 8 }}>
            {[
              ['RUN STATE', pipeline?.status?.toUpperCase() || 'UNKNOWN', runStateTone],
              ['PROGRESS', `${completedCount} / ${visibleSteps.length} complete`, '#f5f5f7'],
              ['ACTIVE AGENT', currentAgent ? `${currentAgent.icon} ${currentAgent.name}` : 'None', currentAgent?.color || '#a1a1aa'],
              ['HANDOFFS', String((pipeline?.handoffs || []).length), '#f5f5f7'],
            ].map(([label, value, color]) => (
              <div key={label} style={{ padding: isMobile ? 10 : '10px 11px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}>
                <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 6 }}>{label}</div>
                <div style={{ fontSize: isMobile ? 12 : 13, color, fontWeight: 700, lineHeight: 1.4 }}>{value}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: isMobile ? 'stretch' : 'flex-end' }}>
            <button
              onClick={onMinimize}
              style={{
                background: 'rgba(245,158,11,0.12)',
                border: '1px solid rgba(245,158,11,0.28)',
                color: '#f59e0b',
                padding: '10px 14px',
                borderRadius: 999,
                cursor: 'pointer',
                fontSize: 11,
                fontFamily: 'Orbitron, sans-serif',
                letterSpacing: '0.1em',
                width: isMobile ? '100%' : 'auto',
              }}
            >
              MINIMIZE
            </button>
            {pipeline?.status === 'running' && (
              <button
                onClick={onStop}
                style={{
                  background: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.4)',
                  color: '#ef4444',
                  padding: '10px 14px',
                  borderRadius: 999,
                  cursor: 'pointer',
                  fontSize: 11,
                  fontFamily: 'Orbitron, sans-serif',
                  letterSpacing: '0.1em',
                  width: isMobile ? '100%' : 'auto',
                }}
              >
                STOP RUN
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: '1px solid #333',
                color: '#888',
                padding: '10px 14px',
                borderRadius: 999,
                cursor: 'pointer',
                fontSize: 11,
                fontFamily: 'JetBrains Mono',
                width: isMobile ? '100%' : 'auto',
              }}
            >
              CLOSE
            </button>
          </div>
        </div>

        <div style={{ padding: isMobile ? '12px 12px 14px' : '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : `repeat(${visibleSteps.length}, minmax(0, 1fr))`, gap: 12, alignItems: 'stretch' }}>
            {visibleSteps.map((step) => {
              const agent = agents?.[step.agentId];
              const result = pipeline?.steps?.[step.agentId];
              const isCurrent = pipeline?.currentStep === step.agentId;
              const isDone = result?.status === 'complete';
              const isError = result?.status === 'error';

              return (
                <div
                  key={step.agentId}
                  style={{
                    padding: isMobile ? '13px 12px' : '10px 10px 12px',
                    background: isDone
                      ? `linear-gradient(180deg, ${agent?.color || '#666'}22, rgba(255,255,255,0.02))`
                      : isCurrent
                        ? `linear-gradient(180deg, ${agent?.color || '#666'}18, rgba(255,255,255,0.03))`
                        : 'rgba(255,255,255,0.02)',
                    border: '1px solid ' + (isDone ? `${agent?.color || '#666'}55` : isCurrent ? `${agent?.color || '#666'}44` : 'rgba(255,255,255,0.06)'),
                    borderRadius: 14,
                    minHeight: isMobile ? 110 : 88,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12 }}>
                    <div style={{ fontSize: 18 }}>{agent?.icon}</div>
                    <div style={{ fontSize: 10, color: isDone ? '#10b981' : isCurrent ? agent?.color || '#ccc' : isError ? '#ef4444' : '#666', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700 }}>
                      {isDone ? 'Complete' : isCurrent ? 'Live' : isError ? 'Error' : 'Queued'}
                    </div>
                  </div>
                  <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 10, fontWeight: 700, color: isDone ? agent?.color || '#ccc' : isCurrent ? agent?.color || '#ccc' : '#c8cad3', marginTop: 12 }}>
                    {agent?.name}
                  </div>
                  <div style={{ fontSize: 11, color: '#7d8192', marginTop: 4, lineHeight: 1.5 }}>{step.label}</div>
                  {isMobile && isCurrent && (
                    <div
                      style={{
                        marginTop: 10,
                        padding: '10px 11px',
                        borderRadius: 10,
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid ' + (agent?.color || '#666') + '2f',
                      }}
                    >
                      <div style={{ fontSize: 9, color: agent?.color || '#ccc', letterSpacing: '0.12em', marginBottom: 6 }}>
                        LIVE TYPING
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: '#d8dbe4',
                          lineHeight: 1.6,
                          fontFamily: 'JetBrains Mono',
                          whiteSpace: 'pre-wrap',
                          maxHeight: 110,
                          overflow: 'auto',
                          WebkitOverflowScrolling: 'touch',
                        }}
                      >
                        {liveStreamText || pipeline?.stepStatus?.[step.agentId] || 'Waiting for output...'}
                      </div>
                    </div>
                  )}
                  {(isMobile || isCurrent) && step.description ? (
                    <div style={{ marginTop: 8, fontSize: 11, color: '#9498ab', lineHeight: 1.5 }}>{step.description}</div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: isMobile ? 12 : 24, WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}>
          {isMobile && pipeline?.status === 'running' && pipeline?.currentStep && (
            <div
              style={{
                marginBottom: 16,
                background: 'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.018))',
                border: '1px solid ' + (agents?.[pipeline.currentStep]?.color || '#888') + '33',
                borderRadius: 18,
                padding: 14,
              }}
            >
              <div
                style={{
                  fontFamily: 'Orbitron, sans-serif',
                  fontSize: 10,
                  color: agents?.[pipeline.currentStep]?.color || '#888',
                  letterSpacing: '0.1em',
                  marginBottom: 10,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: agents?.[pipeline.currentStep]?.color || '#888', animation: 'ping 1s infinite' }} />
                {agents?.[pipeline.currentStep]?.icon} {agents?.[pipeline.currentStep]?.name} LIVE OUTPUT
              </div>
              {pipeline?.stepStatus?.[pipeline.currentStep] && (
                <div style={{ fontSize: 11, color: '#a1a1aa', marginBottom: 10, lineHeight: 1.5 }}>
                  {pipeline.stepStatus[pipeline.currentStep]}
                </div>
              )}
              <div ref={liveOutputRef} style={{ ...outputCardStyle(agents?.[pipeline.currentStep]?.color, true, 220), fontFamily: 'JetBrains Mono', padding: 12 }}>
                {liveStreamText || 'Waiting for live output...'}
                <span style={{ display: 'inline-block', width: 2, height: 14, background: agents?.[pipeline.currentStep]?.color || '#888', marginLeft: 2, verticalAlign: 'middle', animation: 'ping 1s infinite' }} />
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '0.85fr 1.15fr', gap: 18, alignItems: 'start' }}>
            <div style={{ display: 'grid', gap: 16 }}>
              <div style={{ padding: isMobile ? 14 : 16, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16 }}>
                <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 10, color: '#f59e0b', letterSpacing: '0.1em', marginBottom: 10 }}>
                  LIVE HANDOFFS
                </div>
                {(pipeline?.handoffs || []).length === 0 ? (
                  <div style={{ fontSize: 12, color: '#75798a', lineHeight: 1.7 }}>
                    Handoffs will appear here as each agent packages work for the next specialist.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {(pipeline?.handoffs || []).slice(-6).map((handoff, index) => (
                      <div key={`${handoff.from}-${handoff.to}-${index}`} style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ fontSize: 12, color: '#d6d8df', lineHeight: 1.5 }}>
                          <span style={{ color: agents?.[handoff.from]?.color || '#999', fontWeight: 700 }}>{agents?.[handoff.from]?.name || handoff.from}</span>
                          {' -> '}
                          <span style={{ color: agents?.[handoff.to]?.color || '#999', fontWeight: 700 }}>{handoff.toName || agents?.[handoff.to]?.name || handoff.to}</span>
                        </div>
                        <div style={{ fontSize: 11, color: '#868a99', marginTop: 6, lineHeight: 1.6 }}>
                          {(handoff.wordCount || 0)} words ? {handoff.hasStructuredHandoff ? 'structured package' : 'narrative package'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ padding: isMobile ? 14 : 16, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16 }}>
                <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 10, color: '#22d3ee', letterSpacing: '0.1em', marginBottom: 10 }}>
                  CURRENT PULSE
                </div>
                <div style={{ fontSize: 12, color: '#d7d9e1', lineHeight: 1.7 }}>
                  {pipeline?.status === 'running' && currentAgent
                    ? `${currentAgent.name} is active now. The system is preserving live output and preparing the next handoff.`
                    : pipeline?.status === 'complete'
                      ? 'The run has completed and the outputs are now staged for downstream operating workflows.'
                      : pipeline?.status === 'stopping'
                        ? 'The run is finishing its current step before shutting down cleanly.'
                        : pipeline?.status === 'stopped'
                          ? 'The run was stopped before completion.'
                          : pipeline?.error || 'Waiting for the next pipeline event.'}
                </div>
                {latestHandoff && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: 11, color: '#8b90a0', lineHeight: 1.7 }}>
                    Latest transfer: <span style={{ color: agents?.[latestHandoff.from]?.color || '#ccc' }}>{agents?.[latestHandoff.from]?.name || latestHandoff.from}</span> handed work to <span style={{ color: agents?.[latestHandoff.to]?.color || '#ccc' }}>{latestHandoff.toName || agents?.[latestHandoff.to]?.name || latestHandoff.to}</span>.
                  </div>
                )}
              </div>
            </div>

            <div>
              {!isMobile && pipeline?.status === 'running' && pipeline?.currentStep && streamingTokens && streamingTokens[pipeline.currentStep] !== null && (
                <div style={{ marginBottom: 18, background: 'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.018))', border: '1px solid ' + (agents?.[pipeline.currentStep]?.color || '#888') + '33', borderRadius: 18, padding: isMobile ? 14 : 18 }}>
                  <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 10, color: agents?.[pipeline.currentStep]?.color || '#888', letterSpacing: '0.1em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: agents?.[pipeline.currentStep]?.color || '#888', animation: 'ping 1s infinite' }} />
                    {agents?.[pipeline.currentStep]?.icon} {agents?.[pipeline.currentStep]?.name} IS LIVE NOW
                  </div>
                  {pipeline?.stepStatus?.[pipeline.currentStep] && (
                    <div style={{ fontSize: 11, color: '#a1a1aa', marginBottom: 10, lineHeight: 1.5 }}>
                      {pipeline.stepStatus[pipeline.currentStep]}
                    </div>
                  )}
                  <div ref={liveOutputRef} style={{ ...outputCardStyle(agents?.[pipeline.currentStep]?.color, isMobile, isMobile ? 240 : 320), fontFamily: 'JetBrains Mono', padding: isMobile ? 12 : 14 }}>
                    {streamingTokens[pipeline.currentStep] || '...'}
                    <span style={{ display: 'inline-block', width: 2, height: 14, background: agents?.[pipeline.currentStep]?.color || '#888', marginLeft: 2, verticalAlign: 'middle', animation: 'ping 1s infinite' }} />
                  </div>
                </div>
              )}

              {visibleSteps.map((step) => {
                const result = pipeline?.steps?.[step.agentId];
                if (!result) return null;
                const agent = agents?.[step.agentId];
                return (
                  <div key={step.agentId} style={{ marginBottom: 18 }}>
                    <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 10, color: agent?.color || '#ccc', letterSpacing: '0.1em', marginBottom: 8 }}>
                      {agent?.icon} {agent?.name?.toUpperCase()} ? {step.label.toUpperCase()}
                    </div>
                    <div style={outputCardStyle(agent?.color, isMobile, isMobile ? 260 : 180)}>
                      {result.output ? formatAgentOutputForDisplay(step.agentId, result.output) : (result.error || '...')}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {pipeline?.status === 'complete' && (
            <div style={{ textAlign: 'left', color: '#10b981', fontSize: 12, padding: isMobile ? 14 : 18, border: '1px solid #10b98133', borderRadius: 16, background: 'linear-gradient(180deg, rgba(16,185,129,0.12), rgba(16,185,129,0.05))', marginTop: 18 }}>
              <div style={{ fontFamily: 'Orbitron, sans-serif', letterSpacing: '0.12em', fontSize: 10, marginBottom: 8 }}>RUN COMPLETE</div>
              <div style={{ fontSize: isMobile ? 16 : 18, color: '#ecfff8', fontWeight: 700, marginBottom: 8, lineHeight: 1.3 }}>
                Outputs are staged and ready for the next operating move.
              </div>
              <div style={{ color: '#b5ead5', lineHeight: 1.7 }}>
                All pipeline outputs were saved to agent workspaces and promoted into the operating system.
                {pipeline?.calendarEntryCount ? ` ${pipeline.calendarEntryCount} calendar entr${pipeline.calendarEntryCount === 1 ? 'y was' : 'ies were'} created as part of the run.` : ''}
              </div>
              {pipeline?.ghlAutoAttach?.message && (
                <div
                  style={{
                    marginTop: 12,
                    padding: '10px 12px',
                    borderRadius: 12,
                    border: '1px solid ' + (
                      pipeline?.ghlAutoAttach?.status === 'attached'
                        ? 'rgba(59,130,246,0.28)'
                        : pipeline?.ghlAutoAttach?.status === 'skipped'
                          ? 'rgba(245,158,11,0.24)'
                          : 'rgba(239,68,68,0.24)'
                    ),
                    background: pipeline?.ghlAutoAttach?.status === 'attached'
                      ? 'rgba(59,130,246,0.08)'
                      : pipeline?.ghlAutoAttach?.status === 'skipped'
                        ? 'rgba(245,158,11,0.08)'
                        : 'rgba(239,68,68,0.08)',
                    color: pipeline?.ghlAutoAttach?.status === 'attached'
                      ? '#bfdbfe'
                      : pipeline?.ghlAutoAttach?.status === 'skipped'
                        ? '#fcd34d'
                        : '#fca5a5',
                    lineHeight: 1.6,
                  }}
                >
                  {pipeline.ghlAutoAttach.message}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap', flexDirection: isMobile ? 'column' : 'row' }}>
                <button
                  onClick={() => onOpenPipelineReports?.(pipeline?.assetId || '')}
                  style={{
                    padding: '10px 16px',
                    background: 'rgba(59,130,246,0.12)',
                    border: '1px solid rgba(59,130,246,0.35)',
                    borderRadius: 999,
                    color: '#60a5fa',
                    fontFamily: 'Orbitron, sans-serif',
                    fontSize: 10,
                    letterSpacing: '0.08em',
                    cursor: 'pointer',
                    width: isMobile ? '100%' : 'auto',
                  }}
                >
                  OPEN REPORT
                </button>
                <button
                  onClick={() => onOpenLandingPage?.(pipeline?.assetId || '')}
                  style={{
                    padding: '10px 16px',
                    background: 'rgba(16,185,129,0.12)',
                    border: '1px solid rgba(16,185,129,0.35)',
                    borderRadius: 999,
                    color: '#10b981',
                    fontFamily: 'Orbitron, sans-serif',
                    fontSize: 10,
                    letterSpacing: '0.08em',
                    cursor: 'pointer',
                    width: isMobile ? '100%' : 'auto',
                  }}
                >
                  BUILD LANDING PAGE
                </button>
                <button
                  onClick={() => onOpenGhlPages?.(pipeline?.assetId || '')}
                  style={{
                    padding: '10px 16px',
                    background: 'rgba(245,158,11,0.12)',
                    border: '1px solid rgba(245,158,11,0.35)',
                    borderRadius: 999,
                    color: '#f59e0b',
                    fontFamily: 'Orbitron, sans-serif',
                    fontSize: 10,
                    letterSpacing: '0.08em',
                    cursor: 'pointer',
                    width: isMobile ? '100%' : 'auto',
                  }}
                >
                  OPEN GHL PAGE BRIEF
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
