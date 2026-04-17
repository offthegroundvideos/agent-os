'use client';
import { useEffect, useState } from 'react';

export default function WorkflowControlPanel({ onClose }) {
  const [assets, setAssets] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [rubrics, setRubrics] = useState({});
  const [governance, setGovernance] = useState(null);
  const [reviewer, setReviewer] = useState('human');
  const [notes, setNotes] = useState('');
  const [scores, setScores] = useState('8,8,8,8,8,8,8,8');
  const [reworkReasons, setReworkReasons] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [calendarEntries, setCalendarEntries] = useState([]);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const [assetsRes, qaRes, governanceRes] = await Promise.all([
        fetch('/api/assets'),
        fetch('/api/qa'),
        fetch('/api/governance'),
      ]);
      if (!assetsRes.ok) throw new Error('Failed to load assets');
      if (!qaRes.ok) throw new Error('Failed to load QA data');
      if (!governanceRes.ok) throw new Error('Failed to load governance data');
      const assetsData = await assetsRes.json();
      const qaData = await qaRes.json();
      const governanceData = await governanceRes.json();
      const calendarRes = await fetch('/api/content-calendar');
      const calendarData = calendarRes.ok ? await calendarRes.json() : [];
      const nextAssets = Array.isArray(assetsData) ? assetsData : [];
      setAssets(nextAssets);
      setSelectedId(currentSelected => {
        if (!nextAssets.length) return '';
        const stillExists = currentSelected && nextAssets.some(asset => asset.id === currentSelected);
        return stillExists ? currentSelected : nextAssets[0].id;
      });
      setRubrics(qaData.rubrics || {});
      setGovernance(governanceData);
      setCalendarEntries(Array.isArray(calendarData) ? calendarData : []);
      setError('');
    } catch (err) {
      setError(err.message);
      setAssets([]);
      setRubrics({});
      setGovernance(null);
      setCalendarEntries([]);
    }
  }

  const selected = assets.find(asset => asset.id === selectedId);
  const linkedCalendar = calendarEntries.find(entry => entry.asset_id === selected?.id) || null;

  async function postAsset(body) {
    setSaving(true);
    try {
      const res = await fetch('/api/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Asset action failed');
      setError('');
      await load();
      return data;
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function postReview(rubricId) {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch('/api/qa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'review',
          assetId: selected.id,
          rubricId,
          reviewer,
          notes,
          scores: scores.split(',').map(item => Number(item.trim())).filter(Number.isFinite),
          reworkReasons: reworkReasons.split(',').map(item => item.trim()).filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'QA review failed');
      setNotes('');
      setReworkReasons('');
      setError('');
      await load();
      return data;
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = {
    width: '100%',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 4,
    color: '#e2e2e8',
    padding: '8px 10px',
    fontSize: 12,
    outline: 'none',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 1280, maxHeight: '92vh', overflow: 'hidden', background: '#0d0d14', border: '1px solid rgba(34,211,238,0.35)', borderRadius: 6, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 13, fontWeight: 700, color: '#22d3ee', letterSpacing: '0.1em' }}>WORKFLOW CONTROLS</div>
            <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>Asset states, approvals, QA rubrics, and winner governance.</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: '1px solid #333', color: '#888', padding: '5px 12px', borderRadius: 3, cursor: 'pointer', fontSize: 11 }}>X</button>
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

        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', minHeight: 0, flex: 1 }}>
          <div style={{ borderRight: '1px solid rgba(255,255,255,0.06)', overflowY: 'auto', padding: 16 }}>
            <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 8 }}>ASSETS</div>
            <div style={{ display: 'grid', gap: 8 }}>
              {assets.map(asset => (
                <button key={asset.id} onClick={() => setSelectedId(asset.id)} style={{
                  textAlign: 'left', padding: 12, borderRadius: 4, cursor: 'pointer',
                  background: selectedId === asset.id ? 'rgba(34,211,238,0.12)' : 'rgba(255,255,255,0.03)',
                  border: selectedId === asset.id ? '1px solid rgba(34,211,238,0.35)' : '1px solid rgba(255,255,255,0.06)',
                  color: '#e2e2e8',
                }}>
                  <div style={{ fontWeight: 700 }}>{asset.title}</div>
                  <div style={{ fontSize: 11, color: '#777', marginTop: 4 }}>{asset.state}</div>
                </button>
              ))}
              {assets.length === 0 && <div style={{ color: '#666' }}>No assets yet. Run a pipeline first.</div>}
            </div>
          </div>

          <div style={{ overflowY: 'auto', padding: 16 }}>
            {selected ? (
              <>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 18, color: '#fff', fontWeight: 700 }}>{selected.title}</div>
                  <div style={{ fontSize: 12, color: '#777', marginTop: 4 }}>{selected.id} · {selected.state}</div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18 }}>
                  <div style={{ padding: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4 }}>
                    <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 8 }}>APPROVALS</div>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {Object.entries(selected.approvals || {}).map(([key, approved]) => (
                        <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                          <span style={{ color: '#ddd', fontSize: 12 }}>{key}</span>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <span style={{ color: approved ? '#10b981' : '#f59e0b', fontSize: 11 }}>{approved ? 'Approved' : 'Pending'}</span>
                            <button onClick={() => postAsset({ action: 'approval', assetId: selected.id, approvalKey: key, approved: true, changedBy: reviewer, reason: 'Manual approval' })} style={{ padding: '4px 8px', fontSize: 10, cursor: 'pointer' }}>Approve</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ padding: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4 }}>
                    <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 8 }}>STATE TRANSITIONS</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {['research_approved', 'script_approved', 'scheduled', 'published', 'rejected'].map(nextState => (
                        <button key={nextState} onClick={() => postAsset({ action: 'transition', assetId: selected.id, nextState, changedBy: reviewer, reason: 'Manual transition' })} style={{ padding: '6px 10px', fontSize: 10, cursor: 'pointer' }}>
                          {nextState}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18 }}>
                  <div style={{ padding: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4 }}>
                    <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 8 }}>QA REVIEW</div>
                    <div style={{ display: 'grid', gap: 8 }}>
                      <input style={inputStyle} value={reviewer} onChange={e => setReviewer(e.target.value)} placeholder="Reviewer" />
                      <input style={inputStyle} value={scores} onChange={e => setScores(e.target.value)} placeholder="Scores comma-separated" />
                      <textarea style={{ ...inputStyle, minHeight: 70 }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Review notes" />
                      <input style={inputStyle} value={reworkReasons} onChange={e => setReworkReasons(e.target.value)} placeholder="Rework reasons comma-separated" />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => postReview('script')} disabled={saving} style={{ padding: '8px 12px', fontSize: 11, cursor: 'pointer' }}>Run Script QA</button>
                        <button onClick={() => postReview('final_content')} disabled={saving} style={{ padding: '8px 12px', fontSize: 11, cursor: 'pointer' }}>Run Final QA</button>
                      </div>
                    </div>
                  </div>

                  <div style={{ padding: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4 }}>
                    <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 8 }}>GOVERNANCE</div>
                    <div style={{ color: '#ddd', fontSize: 12, lineHeight: 1.8 }}>
                      <div>5x qualifier min: {governance?.winnerThreshold?.fiveXScoreMin}x follower count</div>
                      <div>Save rate min: {governance?.winnerThreshold?.saveRateMin}</div>
                      <div>Share rate min: {governance?.winnerThreshold?.shareRateMin}</div>
                      <div>Comment-to-DM min: {governance?.winnerThreshold?.commentToDmConversionMin}</div>
                    </div>
                  </div>
                </div>

                {linkedCalendar && (
                  <div style={{ padding: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4, marginBottom: 18 }}>
                    <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 8 }}>LINKED CALENDAR + PRODUCTION</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                      <div style={{ fontSize: 12, color: '#ddd', lineHeight: 1.8 }}>
                        <div>Calendar status: {linkedCalendar.status}</div>
                        <div>Publish slot: {linkedCalendar.publish_date} at {linkedCalendar.publish_time}</div>
                        <div>Platforms: {(linkedCalendar.platforms || []).join(', ') || 'n/a'}</div>
                        <div>CTA: {linkedCalendar.cta_id}</div>
                      </div>
                      <div style={{ fontSize: 12, color: '#ddd', lineHeight: 1.8 }}>
                        <div>Shoot: {linkedCalendar.production_bundle?.shootSchedule?.status || 'n/a'}</div>
                        <div>Edit: {linkedCalendar.production_bundle?.editJob?.status || 'n/a'}</div>
                        <div>Render: {linkedCalendar.production_bundle?.renderJob?.status || 'n/a'}</div>
                        <div>Lane: {linkedCalendar.production_bundle?.editJob?.edit_lane || 'n/a'}</div>
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ padding: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4 }}>
                  <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 8 }}>STAGE HISTORY</div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {(selected.stageHistory || []).slice().reverse().map((item, index) => (
                      <div key={index} style={{ fontSize: 12, color: '#ddd' }}>
                        {item.state} · {item.changedBy} · {new Date(item.changedAt).toLocaleString()}
                        {item.reason ? ` · ${item.reason}` : ''}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div style={{ color: '#666' }}>Select an asset to inspect workflow controls.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
