'use client';
import { useEffect, useState } from 'react';

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

    if (parsed.task_name) {
      lines.push(`${toLabel(parsed.task_name)}${parsed.asset_id ? ` for ${parsed.asset_id}` : ''}`);
    }
    if (parsed.summary) {
      lines.push(parsed.summary);
    }

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

    const postNotes = parsed.outputs.post_notes || [];
    if (postNotes.length) {
      lines.push(`Post notes: ${postNotes.slice(0, 3).map(note => formatValue(note)).join('; ')}`);
    }

    const teamAssignments = parsed.outputs.team_assignments || {};
    if (Object.keys(teamAssignments).length) {
      lines.push(`Team: ${Object.entries(teamAssignments).map(([person, duty]) => `${person} - ${duty}`).join('; ')}`);
    }

    if (parsed.recommended_next_step) {
      lines.push(`Next: ${parsed.recommended_next_step}`);
    }

    return lines.join('\n\n');
  }

  return Object.entries(parsed)
    .map(([key, value]) => `${toLabel(key)}: ${formatValue(value)}`)
    .join('\n\n');
}

function formatTrailSummary(step) {
  const header = `${step.agentName || step.agentId} | ${step.role || 'Agent step'}`;
  return `${header}\n${formatStructuredSummary(step.summary)}`;
}

function formatEntrySubtitle(entry) {
  const parts = [
    entry.publish_date,
    entry.platforms?.join(', '),
    entry.format ? entry.format.replace(/_/g, ' ') : '',
    entry.cta_id && entry.cta_id !== 'cta_default' ? entry.cta_id.replace(/^cta_/, '').replace(/_/g, ' ') : '',
  ].filter(Boolean);
  return parts.join(' | ');
}

export default function ContentCalendarPanel({ onClose }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState('');
  const [error, setError] = useState('');
  const [generatingProduction, setGeneratingProduction] = useState(false);
  const [updatingProduction, setUpdatingProduction] = useState(false);

  useEffect(() => {
    loadEntries();
  }, []);

  async function loadEntries() {
    setLoading(true);
    try {
      const res = await fetch('/api/content-calendar');
      if (!res.ok) throw new Error('Failed to load content calendar');
      const data = await res.json();
      const nextEntries = Array.isArray(data) ? data : [];
      setEntries(nextEntries);
      setSelectedId(currentSelected => {
        if (!nextEntries.length) return '';
        const stillExists = currentSelected && nextEntries.some(entry => entry.id === currentSelected);
        return stillExists ? currentSelected : nextEntries[0].id;
      });
      setError('');
    } catch (err) {
      setError(err.message);
      setEntries([]);
      setSelectedId('');
    } finally {
      setLoading(false);
    }
  }

  const selected = entries.find(entry => entry.id === selectedId) || entries[0] || null;

  async function generateProductionBundle(entryId) {
    setGeneratingProduction(true);
    try {
      const res = await fetch('/api/production-ops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate', entryId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate production bundle');
      await loadEntries();
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setGeneratingProduction(false);
    }
  }

  async function updateProductionStatus(entryId, payload) {
    setUpdatingProduction(true);
    try {
      const res = await fetch('/api/production-ops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update-status',
          entryId,
          changedBy: 'human',
          reason: 'Manual production update',
          ...payload,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update production status');
      await loadEntries();
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setUpdatingProduction(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 1320, maxHeight: '92vh', overflow: 'hidden', background: '#0d0d14', border: '1px solid rgba(59,130,246,0.35)', borderRadius: 6, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 13, fontWeight: 700, color: '#3b82f6', letterSpacing: '0.1em' }}>CONTENT CALENDAR</div>
            <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>Pipeline outputs connected to publish planning, CTA, and footage picks.</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: '1px solid #333', color: '#888', padding: '5px 12px', borderRadius: 3, cursor: 'pointer', fontSize: 11 }}>X</button>
        </div>
        {error && (
          <div style={{ padding: '10px 20px', background: 'rgba(239,68,68,0.08)', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#ef4444', fontSize: 11 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', flex: 1, minHeight: 0 }}>
          <div style={{ borderRight: '1px solid rgba(255,255,255,0.06)', overflowY: 'auto', padding: 16 }}>
            <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 8 }}>CALENDAR ENTRIES</div>
            {loading ? (
              <div style={{ color: '#555', fontSize: 12 }}>Loading...</div>
            ) : entries.length === 0 ? (
              <div style={{ color: '#666', fontSize: 12, lineHeight: 1.7 }}>No calendar entries yet. Run a pipeline and let it generate planning records.</div>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {entries.map(entry => (
                  <button
                    key={entry.id}
                    onClick={() => setSelectedId(entry.id)}
                    style={{
                      textAlign: 'left',
                      padding: 12,
                      borderRadius: 4,
                      cursor: 'pointer',
                      background: selectedId === entry.id ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.03)',
                      border: selectedId === entry.id ? '1px solid rgba(59,130,246,0.35)' : '1px solid rgba(255,255,255,0.06)',
                      color: '#e2e2e8',
                    }}
                  >
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>{entry.title}</div>
                    <div style={{ fontSize: 11, color: '#777' }}>{formatEntrySubtitle(entry)}</div>
                    <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>{entry.lane} | {entry.journey_stage}</div>
                    <div style={{ fontSize: 11, color: '#3b82f6', marginTop: 4 }}>{entry.status}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ overflowY: 'auto', padding: 16 }}>
            {selected ? (
              <>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 20, color: '#fff', fontWeight: 700 }}>{selected.title}</div>
                  <div style={{ fontSize: 12, color: '#777', marginTop: 4 }}>{selected.publish_date} at {selected.publish_time} | {selected.platforms?.join(', ')}</div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18 }}>
                  <div style={{ padding: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4 }}>
                    <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 8 }}>PLANNING</div>
                    <div style={{ color: '#ddd', fontSize: 12, lineHeight: 1.8 }}>
                      <div>Lane: {selected.lane}</div>
                      <div>Journey: {selected.journey_stage}</div>
                      <div>Trend lane: {selected.trend_lane}</div>
                      <div>Format: {selected.format}</div>
                      <div>CTA: {selected.cta_id}</div>
                      <div>Script: {selected.script_id || 'n/a'}</div>
                      <div>Asset: {selected.asset_id || 'n/a'}</div>
                    </div>
                  </div>

                  <div style={{ padding: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4 }}>
                    <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 8 }}>FOOTAGE PICKS</div>
                    {(selected.footage_recommendations || []).length === 0 ? (
                      <div style={{ color: '#666', fontSize: 12 }}>No footage matches found yet.</div>
                    ) : (
                      <div style={{ display: 'grid', gap: 8 }}>
                        {selected.footage_recommendations.map(item => (
                          <div key={`${item.type}-${item.id}`} style={{ fontSize: 12, color: '#ddd', lineHeight: 1.6 }}>
                            <div>{item.title}</div>
                            <div style={{ color: '#777', fontSize: 11 }}>{item.type} | score {item.score} | {item.location || 'no location'}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ padding: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4, marginBottom: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em' }}>PRODUCTION OPS</div>
                    <button
                      onClick={() => generateProductionBundle(selected.id)}
                      disabled={generatingProduction || updatingProduction}
                      style={{
                        background: generatingProduction || updatingProduction ? 'rgba(59,130,246,0.08)' : 'rgba(59,130,246,0.12)',
                        border: '1px solid rgba(59,130,246,0.3)',
                        color: '#60a5fa',
                        padding: '6px 10px',
                        borderRadius: 3,
                        cursor: generatingProduction || updatingProduction ? 'not-allowed' : 'pointer',
                        fontSize: 10,
                      }}
                    >
                      {generatingProduction ? 'Generating...' : 'Refresh Production Plan'}
                    </button>
                  </div>

                  {selected.production_bundle ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                      <div style={{ padding: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
                        <div style={{ fontSize: 10, color: '#777', letterSpacing: '0.08em', marginBottom: 6 }}>SHOOT</div>
                        <div style={{ fontSize: 12, color: '#ddd', lineHeight: 1.8 }}>
                          <div>Status: {selected.production_bundle.shootSchedule?.status || 'n/a'}</div>
                          <div>Date: {selected.production_bundle.shootSchedule?.shoot_date || 'n/a'}</div>
                          <div>Owner: {selected.production_bundle.shootSchedule?.owner || 'n/a'}</div>
                          <div>Location: {selected.production_bundle.shootSchedule?.location || 'n/a'}</div>
                          <div>Talent: {(selected.production_bundle.shootSchedule?.talent || []).join(', ') || 'n/a'}</div>
                        </div>
                        {(selected.production_bundle.shootSchedule?.shot_requirements || []).length > 0 && (
                          <div style={{ marginTop: 8, fontSize: 11, color: '#aaa', lineHeight: 1.7 }}>
                            {(selected.production_bundle.shootSchedule.shot_requirements || []).slice(0, 3).map((item, index) => (
                              <div key={index}>- {item}</div>
                            ))}
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                          <button onClick={() => updateProductionStatus(selected.id, { shootStatus: 'shoot_scheduled' })} disabled={updatingProduction} style={{ padding: '4px 8px', fontSize: 10, cursor: 'pointer' }}>Schedule Shoot</button>
                          <button onClick={() => updateProductionStatus(selected.id, { shootStatus: 'shot' })} disabled={updatingProduction} style={{ padding: '4px 8px', fontSize: 10, cursor: 'pointer' }}>Mark Shot</button>
                          <button onClick={() => updateProductionStatus(selected.id, { shootStatus: 'handoff_to_edit', editStatus: 'processing' })} disabled={updatingProduction} style={{ padding: '4px 8px', fontSize: 10, cursor: 'pointer' }}>Send To Edit</button>
                        </div>
                      </div>

                      <div style={{ padding: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
                        <div style={{ fontSize: 10, color: '#777', letterSpacing: '0.08em', marginBottom: 6 }}>EDIT</div>
                        <div style={{ fontSize: 12, color: '#ddd', lineHeight: 1.8 }}>
                          <div>Status: {selected.production_bundle.editJob?.status || 'n/a'}</div>
                          <div>Lane: {selected.production_bundle.editJob?.edit_lane || 'n/a'}</div>
                          <div>Tier: {selected.production_bundle.editJob?.edit_tier || 'n/a'}</div>
                          <div>Editor: {selected.production_bundle.editJob?.editor || 'n/a'}</div>
                          <div>Due: {selected.production_bundle.editJob?.due_date || 'n/a'}</div>
                        </div>
                        <div style={{ marginTop: 8, fontSize: 11, color: '#aaa', lineHeight: 1.7 }}>
                          <div>Source media: {(selected.production_bundle.editJob?.source_media_ids || []).length}</div>
                          <div>Library clips: {(selected.production_bundle.editJob?.footage_ids || []).length}</div>
                          <div>Captions: {selected.production_bundle.editJob?.caption_style || 'n/a'}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                          <button onClick={() => updateProductionStatus(selected.id, { editStatus: 'processing' })} disabled={updatingProduction} style={{ padding: '4px 8px', fontSize: 10, cursor: 'pointer' }}>Start Edit</button>
                          <button onClick={() => updateProductionStatus(selected.id, { editStatus: 'rendered', renderStatus: 'rendered' })} disabled={updatingProduction} style={{ padding: '4px 8px', fontSize: 10, cursor: 'pointer' }}>Mark Edited</button>
                        </div>
                      </div>

                      <div style={{ padding: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
                        <div style={{ fontSize: 10, color: '#777', letterSpacing: '0.08em', marginBottom: 6 }}>RENDER</div>
                        <div style={{ fontSize: 12, color: '#ddd', lineHeight: 1.8 }}>
                          <div>Status: {selected.production_bundle.renderJob?.status || 'n/a'}</div>
                          <div>Due: {selected.production_bundle.renderJob?.due_date || 'n/a'}</div>
                          <div>Targets: {(selected.production_bundle.renderJob?.output_targets || []).join(', ') || 'n/a'}</div>
                        </div>
                        {selected.production_bundle.renderJob?.notes && (
                          <div style={{ marginTop: 8, fontSize: 11, color: '#aaa', lineHeight: 1.7 }}>
                            {selected.production_bundle.renderJob.notes}
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                          <button onClick={() => updateProductionStatus(selected.id, { renderStatus: 'approved' })} disabled={updatingProduction} style={{ padding: '4px 8px', fontSize: 10, cursor: 'pointer' }}>Ready For QA</button>
                          <button onClick={() => updateProductionStatus(selected.id, { renderStatus: 'published_ready' })} disabled={updatingProduction} style={{ padding: '4px 8px', fontSize: 10, cursor: 'pointer' }}>Publish Ready</button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ color: '#666', fontSize: 12 }}>No production bundle attached yet.</div>
                  )}
                </div>

                <div style={{ padding: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4, marginBottom: 18 }}>
                  <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 8 }}>SOURCE SUMMARY</div>
                  <div style={{ fontSize: 12, color: '#ddd', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                    {formatStructuredSummary(selected.source_summary)}
                  </div>
                </div>

                <div style={{ padding: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4 }}>
                  <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 8 }}>HANDOFF TRAIL</div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {(selected.handoff_trail || []).map((step, index) => (
                      <div key={`${step.agentId}-${index}`} style={{ fontSize: 12, color: '#ddd', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                        {formatTrailSummary(step)}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div style={{ color: '#666', fontSize: 12 }}>Select a calendar entry to inspect it.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
