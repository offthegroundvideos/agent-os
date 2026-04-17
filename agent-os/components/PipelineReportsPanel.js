'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  buildAgentSummaries,
  buildClientReportMarkdown,
  buildFullReportMarkdown,
  buildSummaryDocument,
  formatDate,
  normalizeAssets,
  parseTopicField,
  slugify,
} from '../lib/pipelineReports';

function downloadTextFile(filename, contents) {
  const blob = new Blob([contents], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function ReportNavButton({ active, color, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '8px 12px',
        borderRadius: 999,
        border: '1px solid ' + (active ? `${color}55` : 'rgba(255,255,255,0.08)'),
        background: active ? `${color}18` : 'rgba(255,255,255,0.02)',
        color: active ? color : '#aab3c4',
        cursor: 'pointer',
        fontSize: 10,
        fontFamily: 'Orbitron, sans-serif',
        letterSpacing: '0.08em',
      }}
    >
      {children}
    </button>
  );
}

export default function PipelineReportsPanel({ onClose, initialAssetId = '' }) {
  const [assets, setAssets] = useState([]);
  const [selectedAssetId, setSelectedAssetId] = useState(initialAssetId);
  const [activeTab, setActiveTab] = useState('summary');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadAssets();
  }, []);

  useEffect(() => {
    if (initialAssetId) setSelectedAssetId(initialAssetId);
  }, [initialAssetId]);

  async function loadAssets() {
    try {
      const loadFrom = async (url) => {
        const res = await fetch(url);
        if (!res.ok) return [];
        const payload = await res.json();
        return normalizeAssets(payload)
          .filter((asset) => asset?.outputs && Object.keys(asset.outputs).length > 0)
          .sort((a, b) => new Date(b.updatedAt || b.updated_at || 0) - new Date(a.updatedAt || a.updated_at || 0));
      };

      let nextAssets = await loadFrom('/api/pipeline-runs?limit=200');
      if (nextAssets.length === 0) {
        nextAssets = await loadFrom('/api/assets');
      }

      setAssets(nextAssets);
      setSelectedAssetId((current) => current || nextAssets[0]?.id || '');
      setError('');
    } catch (loadError) {
      setError(loadError.message);
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }

  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === selectedAssetId) || assets[0] || null,
    [assets, selectedAssetId]
  );

  const agentSummaries = useMemo(
    () => buildAgentSummaries(selectedAsset || {}),
    [selectedAsset]
  );

  const summaryDocument = useMemo(
    () => buildSummaryDocument(selectedAsset || {}, agentSummaries),
    [selectedAsset, agentSummaries]
  );

  const reportBaseName = useMemo(() => {
    const clientName = parseTopicField(selectedAsset?.topic, 'Client') || selectedAsset?.title || selectedAsset?.id || 'pipeline-report';
    return slugify(clientName);
  }, [selectedAsset]);

  const selectedAgent = activeTab === 'summary'
    ? null
    : agentSummaries.find((summary) => summary.agentId === activeTab) || null;

  const downloadPdf = (type = 'client') => {
    if (!selectedAsset?.id) return;
    window.open(`/api/pipeline-report?assetId=${encodeURIComponent(selectedAsset.id)}&type=${encodeURIComponent(type)}`, '_blank');
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }}>
      <div style={{ background: '#0d0d14', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 4, width: '100%', maxWidth: 1320, maxHeight: '92vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 0 60px rgba(59,130,246,0.1)' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
          <div>
            <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 13, fontWeight: 700, color: '#3b82f6', letterSpacing: '0.1em' }}>
              PIPELINE REPORTS
            </div>
            <div style={{ fontSize: 10, color: '#667085', marginTop: 2 }}>
              Saved run history, per-agent writeups, and client-ready deliverables.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              type="button"
              onClick={loadAssets}
              style={{
                padding: '6px 12px',
                background: 'rgba(59,130,246,0.08)',
                border: '1px solid rgba(59,130,246,0.3)',
                borderRadius: 3,
                color: '#3b82f6',
                fontFamily: 'JetBrains Mono',
                fontSize: 10,
                cursor: 'pointer',
              }}
            >
              REFRESH
            </button>
            <button onClick={onClose} style={{ background: 'transparent', border: '1px solid #333', color: '#888', padding: '4px 12px', borderRadius: 2, cursor: 'pointer', fontSize: 11, fontFamily: 'JetBrains Mono' }}>
              ✕
            </button>
          </div>
        </div>

        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '340px minmax(0, 1fr)', minHeight: 0 }}>
          <div style={{ borderRight: '1px solid rgba(255,255,255,0.06)', overflow: 'auto', padding: 16 }}>
            <div style={{ fontSize: 9, color: '#6b7280', letterSpacing: '0.2em', marginBottom: 12 }}>SAVED RUNS</div>
            {loading ? (
              <div style={{ fontSize: 12, color: '#6b7280' }}>Loading reports...</div>
            ) : error ? (
              <div style={{ fontSize: 12, color: '#fca5a5', lineHeight: 1.6 }}>{error}</div>
            ) : assets.length === 0 ? (
              <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.7 }}>No saved pipeline reports yet.</div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {assets.map((asset) => {
                  const clientName = parseTopicField(asset.topic, 'Client') || 'General';
                  const niche = parseTopicField(asset.topic, 'Niche') || asset.pipelineType || 'Pipeline';
                  const selected = selectedAsset?.id === asset.id;
                  return (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => {
                        setSelectedAssetId(asset.id);
                        setActiveTab('summary');
                      }}
                      style={{
                        textAlign: 'left',
                        padding: '12px 13px',
                        borderRadius: 12,
                        border: '1px solid ' + (selected ? 'rgba(59,130,246,0.42)' : 'rgba(255,255,255,0.08)'),
                        background: selected ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.02)',
                        cursor: 'pointer',
                      }}
                      >
                        <div style={{ fontSize: 12, color: '#f4f5f7', fontWeight: 700, lineHeight: 1.5 }}>{clientName}</div>
                        <div style={{ fontSize: 11, color: '#a5b4cb', marginTop: 4, lineHeight: 1.5 }}>{niche}</div>
                      <div style={{ fontSize: 10, color: '#6b7280', marginTop: 8 }}>{formatDate(asset.updatedAt || asset.updated_at)}</div>
                      <div style={{ fontSize: 10, color: '#90a4c3', marginTop: 4, lineHeight: 1.4 }}>
                        {String(asset.runStatus || asset.state || 'unknown').toUpperCase()}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ overflow: 'auto', padding: 20 }}>
            {!selectedAsset ? (
              <div style={{ fontSize: 12, color: '#6b7280' }}>Select a saved run to open the report.</div>
            ) : (
              <div style={{ display: 'grid', gap: 18 }}>
                <div style={{ padding: 16, borderRadius: 16, border: '1px solid rgba(255,255,255,0.06)', background: 'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.015))' }}>
                  <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 10, color: '#60a5fa', letterSpacing: '0.14em', marginBottom: 10 }}>
                    REPORT OVERVIEW
                  </div>
                  <div style={{ fontSize: 20, color: '#f5f5f7', fontWeight: 700, lineHeight: 1.25 }}>
                    {parseTopicField(selectedAsset.topic, 'Client') || selectedAsset.title || selectedAsset.topic}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 12, color: '#94a3b8', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                    {selectedAsset.topic}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 10, marginTop: 14 }}>
                    {[
                      ['TYPE', String(selectedAsset.pipelineType || 'general').toUpperCase()],
                      ['STATE', String(selectedAsset.state || 'unknown').toUpperCase()],
                      ['AGENTS', String(agentSummaries.length)],
                      ['UPDATED', formatDate(selectedAsset.updatedAt || selectedAsset.updated_at)],
                    ].map(([label, value]) => (
                      <div key={label} style={{ padding: '10px 11px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
                        <div style={{ fontSize: 9, color: '#6b7280', letterSpacing: '0.14em', marginBottom: 6 }}>{label}</div>
                        <div style={{ fontSize: 12, color: '#e5e7eb', lineHeight: 1.45 }}>{value}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
                    <button
                      type="button"
                      onClick={() => downloadPdf('client')}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 999,
                        border: '1px solid rgba(16,185,129,0.35)',
                        background: 'rgba(16,185,129,0.12)',
                        color: '#10b981',
                        cursor: 'pointer',
                        fontSize: 10,
                        fontFamily: 'Orbitron, sans-serif',
                        letterSpacing: '0.08em',
                      }}
                    >
                      DOWNLOAD CLIENT PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadTextFile(`${reportBaseName}-client-report.md`, buildClientReportMarkdown(selectedAsset, summaryDocument, agentSummaries))}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 999,
                        border: '1px solid rgba(16,185,129,0.22)',
                        background: 'rgba(16,185,129,0.06)',
                        color: '#86efac',
                        cursor: 'pointer',
                        fontSize: 10,
                        fontFamily: 'Orbitron, sans-serif',
                        letterSpacing: '0.08em',
                      }}
                    >
                      DOWNLOAD CLIENT MARKDOWN
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadTextFile(`${reportBaseName}-full-run.md`, buildFullReportMarkdown(selectedAsset, summaryDocument, agentSummaries))}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 999,
                        border: '1px solid rgba(59,130,246,0.35)',
                        background: 'rgba(59,130,246,0.12)',
                        color: '#60a5fa',
                        cursor: 'pointer',
                        fontSize: 10,
                        fontFamily: 'Orbitron, sans-serif',
                        letterSpacing: '0.08em',
                      }}
                    >
                      DOWNLOAD FULL REPORT
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <ReportNavButton active={activeTab === 'summary'} color="#3b82f6" onClick={() => setActiveTab('summary')}>
                    SUMMARY DOC
                  </ReportNavButton>
                  {agentSummaries.map((summary) => (
                    <ReportNavButton key={summary.agentId} active={activeTab === summary.agentId} color={summary.color} onClick={() => setActiveTab(summary.agentId)}>
                      {summary.icon} {summary.name.toUpperCase()}
                    </ReportNavButton>
                  ))}
                </div>

                {activeTab === 'summary' ? (
                  <div style={{ display: 'grid', gap: 16 }}>
                    <div style={{ padding: 16, borderRadius: 16, border: '1px solid rgba(16,185,129,0.22)', background: 'linear-gradient(180deg, rgba(16,185,129,0.1), rgba(16,185,129,0.04))' }}>
                      <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 10, color: '#10b981', letterSpacing: '0.12em', marginBottom: 10 }}>
                        FULL SUMMARY DOCUMENT
                      </div>
                      <div style={{ display: 'grid', gap: 14 }}>
                        <div>
                          <div style={{ fontSize: 10, color: '#86efac', letterSpacing: '0.12em', marginBottom: 8 }}>RUN SNAPSHOT</div>
                          <div style={{ display: 'grid', gap: 8 }}>
                            {summaryDocument.overview.map((line) => (
                              <div key={line} style={{ fontSize: 12, color: '#dcfce7', lineHeight: 1.6 }}>• {line}</div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: '#86efac', letterSpacing: '0.12em', marginBottom: 8 }}>ACTION ITEMS</div>
                          <div style={{ display: 'grid', gap: 8 }}>
                            {summaryDocument.actionItems.length ? summaryDocument.actionItems.map((item) => (
                              <div key={item} style={{ fontSize: 12, color: '#d1fae5', lineHeight: 1.6 }}>• {item}</div>
                            )) : (
                              <div style={{ fontSize: 12, color: '#d1fae5', lineHeight: 1.6 }}>• No structured action items were extracted from this run.</div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gap: 12 }}>
                      {agentSummaries.map((summary) => (
                        <div key={summary.agentId} style={{ padding: 14, borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                          <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 10, color: summary.color, letterSpacing: '0.12em', marginBottom: 10 }}>
                            {summary.icon} {summary.name.toUpperCase()} · {summary.role.toUpperCase()}
                          </div>
                          <div style={{ display: 'grid', gap: 8 }}>
                            {summary.bullets.length ? summary.bullets.map((bullet) => (
                              <div key={bullet} style={{ fontSize: 12, color: '#d7dbe4', lineHeight: 1.6 }}>• {bullet}</div>
                            )) : (
                              <div style={{ fontSize: 12, color: '#9097a7', lineHeight: 1.6 }}>• Full output is available in the agent tab.</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : selectedAgent ? (
                  <div style={{ display: 'grid', gap: 16 }}>
                    <div style={{ padding: 16, borderRadius: 16, border: '1px solid ' + selectedAgent.color + '33', background: 'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.015))' }}>
                      <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 10, color: selectedAgent.color, letterSpacing: '0.12em', marginBottom: 10 }}>
                        {selectedAgent.icon} {selectedAgent.name.toUpperCase()} SUMMARY
                      </div>
                      <div style={{ display: 'grid', gap: 8 }}>
                        {selectedAgent.bullets.length ? selectedAgent.bullets.map((bullet) => (
                          <div key={bullet} style={{ fontSize: 12, color: '#d7dbe4', lineHeight: 1.6 }}>• {bullet}</div>
                        )) : (
                          <div style={{ fontSize: 12, color: '#9097a7', lineHeight: 1.6 }}>• No structured summary extracted for this agent.</div>
                        )}
                      </div>
                    </div>

                    <div style={{ padding: 16, borderRadius: 16, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                      <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 10, color: '#cbd5e1', letterSpacing: '0.12em', marginBottom: 10 }}>
                        FULL AGENT OUTPUT
                      </div>
                      <div style={{ fontSize: 12, color: '#d1d5de', lineHeight: 1.75, whiteSpace: 'pre-wrap', maxHeight: '52vh', overflow: 'auto', fontFamily: 'JetBrains Mono' }}>
                        {selectedAgent.output || 'No output saved for this agent.'}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
