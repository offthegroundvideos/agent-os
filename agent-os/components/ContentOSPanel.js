'use client';
import { useEffect, useState } from 'react';

const inputStyle = {
  width: '100%',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 4,
  color: '#e2e2e8',
  padding: '8px 10px',
  fontSize: 12,
  outline: 'none',
  boxSizing: 'border-box',
};

const defaultOffer = { name: '', service: '', leadMagnet: '', customerProblem: '', ctaPath: '', contentPillar: '', landingPageLanguage: '', salesPromise: '', continuityNotes: '' };
const defaultProof = { title: '', proofType: 'case-study', summary: '', metric: '', story: '', tags: '' };
const defaultClaim = { claim: '', claimType: 'approved', evidence: '', saferVersion: '' };
const defaultPattern = { pattern: '', category: 'hook', whyItFails: '', avoidRule: '' };
const defaultTopic = {
  title: '',
  contentPillar: '',
  lane: 'reach',
  journeyStage: 'problem-aware',
  trendLane: 'evergreen',
  productionLift: 'medium',
  repurposeReady: false,
  onCameraIntensity: 'medium',
  formatBias: '',
  owner: 'system',
  priority: 'medium',
  status: 'idea_backlog',
  audiencePain: 7,
  offerRelevance: 7,
  proofAvailability: 6,
  easeOfFilming: 7,
  shareSavePotential: 7,
  qualifiedLeadPotential: 7,
  freshness: 5,
  repeatability: 7,
};
const defaultLead = { sourcePost: '', hook: '', cta: '', offerWanted: '', qualified: true, booked: false, bought: false, dealSize: '', decisionReason: '', fitNotes: '' };
const defaultObjection = { objection: '', source: 'sales-call', responseAngle: '', notes: '' };
const defaultExperiment = { name: '', variable: '', constant: '', reps: 3, winnerMetric: '', scaleThreshold: '', status: 'planned' };
const defaultReality = { category: 'production', finding: '', implication: '', notes: '' };
const defaultAntiFluff = { myth: '', whyWrong: '', replacement: '' };

function Section({ title, subtitle, children }) {
  return (
    <div style={{ padding: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6 }}>
      <div style={{ fontSize: 10, color: '#67e8f9', letterSpacing: '0.12em', marginBottom: 4 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 11, color: '#666', marginBottom: 10 }}>{subtitle}</div>}
      {children}
    </div>
  );
}

export default function ContentOSPanel({ onClose }) {
  const [summary, setSummary] = useState(null);
  const [state, setState] = useState(null);
  const [queue, setQueue] = useState([]);
  const [saving, setSaving] = useState(false);
  const [strategy, setStrategy] = useState(null);
  const [offer, setOffer] = useState(defaultOffer);
  const [proof, setProof] = useState(defaultProof);
  const [claim, setClaim] = useState(defaultClaim);
  const [pattern, setPattern] = useState(defaultPattern);
  const [topic, setTopic] = useState(defaultTopic);
  const [lead, setLead] = useState(defaultLead);
  const [objection, setObjection] = useState(defaultObjection);
  const [experiment, setExperiment] = useState(defaultExperiment);
  const [reality, setReality] = useState(defaultReality);
  const [antiFluff, setAntiFluff] = useState(defaultAntiFluff);
  const [seriesPreview, setSeriesPreview] = useState([]);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    const [summaryRes, stateRes, queueRes] = await Promise.all([
      fetch('/api/content-os'),
      fetch('/api/content-os?action=state'),
      fetch('/api/content-os?action=queue&limit=10'),
    ]);
    const summaryJson = await summaryRes.json();
    const stateJson = await stateRes.json();
    const queueJson = await queueRes.json();
    setSummary(summaryJson);
    setState(stateJson);
    setQueue(queueJson);
    setStrategy(stateJson.strategy);
  }

  async function post(action, payload = {}) {
    setSaving(true);
    try {
      const res = await fetch('/api/content-os', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      await loadAll();
      return data;
    } finally {
      setSaving(false);
    }
  }

  if (!strategy || !state) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 24,
    }}>
      <div style={{
        width: '100%', maxWidth: 1360, maxHeight: '92vh', overflow: 'hidden',
        background: '#0d0d14', border: '1px solid rgba(34,211,238,0.35)',
        borderRadius: 6, boxShadow: '0 0 60px rgba(34,211,238,0.08)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 13, fontWeight: 700, color: '#22d3ee', letterSpacing: '0.1em' }}>
              CONTENT OS
            </div>
            <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>
              Strategy thesis, offer map, proof, claim safety, topic scoring, series engine, and lead quality memory.
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: '1px solid #333', color: '#888',
            padding: '5px 12px', borderRadius: 3, cursor: 'pointer', fontSize: 11,
          }}>X</button>
        </div>

        <div style={{ padding: 16, overflowY: 'auto', display: 'grid', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
            {[
              { label: 'Offers', value: summary?.offerCount || 0 },
              { label: 'Proof', value: summary?.proofCount || 0 },
              { label: 'Topics', value: summary?.topicCount || 0 },
              { label: 'Ready Queue', value: summary?.readyQueueCount || 0 },
              { label: 'Prod Queue', value: summary?.productionQueueCount || 0 },
              { label: 'Leads', value: summary?.leadQuality?.totalLeads || 0 },
            ].map((item) => (
              <div key={item.label} style={{ padding: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4 }}>
                <div style={{ fontSize: 9, color: '#666', letterSpacing: '0.12em', marginBottom: 6 }}>{item.label}</div>
                <div style={{ fontSize: 20, color: '#22d3ee', fontWeight: 700 }}>{item.value}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 14 }}>
            <Section title="STRATEGY THESIS" subtitle="The layer that keeps content tied to monetizable intent.">
              <div style={{ display: 'grid', gap: 8 }}>
                <textarea style={{ ...inputStyle, minHeight: 74 }} value={strategy.contentThesis} onChange={(e) => setStrategy((prev) => ({ ...prev, contentThesis: e.target.value }))} />
                <input style={inputStyle} value={strategy.knownFor} onChange={(e) => setStrategy((prev) => ({ ...prev, knownFor: e.target.value }))} placeholder="What the brand wants to be known for" />
                <textarea style={{ ...inputStyle, minHeight: 62 }} value={(strategy.beliefs || []).join('\n')} onChange={(e) => setStrategy((prev) => ({ ...prev, beliefs: e.target.value.split(/\r?\n/).filter(Boolean) }))} placeholder="Beliefs, one per line" />
                <textarea style={{ ...inputStyle, minHeight: 62 }} value={(strategy.audiencePain || []).join('\n')} onChange={(e) => setStrategy((prev) => ({ ...prev, audiencePain: e.target.value.split(/\r?\n/).filter(Boolean) }))} placeholder="Audience pain, one per line" />
                <textarea style={{ ...inputStyle, minHeight: 62 }} value={(strategy.outcomes || []).join('\n')} onChange={(e) => setStrategy((prev) => ({ ...prev, outcomes: e.target.value.split(/\r?\n/).filter(Boolean) }))} placeholder="Desired outcomes, one per line" />
                <input style={inputStyle} value={strategy.qualifiedLeadDefinition || ''} onChange={(e) => setStrategy((prev) => ({ ...prev, qualifiedLeadDefinition: e.target.value }))} placeholder="Qualified lead definition" />
                <textarea style={{ ...inputStyle, minHeight: 62 }} value={(strategy.continuityRules || []).join('\n')} onChange={(e) => setStrategy((prev) => ({ ...prev, continuityRules: e.target.value.split(/\r?\n/).filter(Boolean) }))} placeholder="Content-to-offer continuity rules" />
                <button onClick={() => post('updateStrategy', { strategy })} disabled={saving} style={buttonStyle('#22d3ee')}>
                  {saving ? 'Saving...' : 'Save Strategy'}
                </button>
              </div>
            </Section>

            <Section title="VOICE + CONSTRAINTS" subtitle="Guardrails that keep multi-agent writing consistent and premium.">
              <div style={{ display: 'grid', gap: 8 }}>
                <textarea style={{ ...inputStyle, minHeight: 56 }} value={(strategy.brandVoice?.saysOften || []).join(', ')} onChange={(e) => setStrategy((prev) => ({ ...prev, brandVoice: { ...prev.brandVoice, saysOften: e.target.value.split(',').map((item) => item.trim()).filter(Boolean) } }))} placeholder="Phrases the brand says often" />
                <textarea style={{ ...inputStyle, minHeight: 56 }} value={(strategy.brandVoice?.neverSays || []).join(', ')} onChange={(e) => setStrategy((prev) => ({ ...prev, brandVoice: { ...prev.brandVoice, neverSays: e.target.value.split(',').map((item) => item.trim()).filter(Boolean) } }))} placeholder="Phrases the brand never says" />
                <textarea style={{ ...inputStyle, minHeight: 86 }} value={(strategy.creativeConstraints || []).join('\n')} onChange={(e) => setStrategy((prev) => ({ ...prev, creativeConstraints: e.target.value.split(/\r?\n/).filter(Boolean) }))} placeholder="Creative constraints" />
                <textarea style={{ ...inputStyle, minHeight: 70 }} value={(strategy.moat || []).join('\n')} onChange={(e) => setStrategy((prev) => ({ ...prev, moat: e.target.value.split(/\r?\n/).filter(Boolean) }))} placeholder="Moat sources" />
                <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 8 }}>
                  <select style={inputStyle} value={strategy.capacityMode?.current || 'high'} onChange={(e) => setStrategy((prev) => ({ ...prev, capacityMode: { ...prev.capacityMode, current: e.target.value } }))}>
                    <option value="high">High-capacity mode</option>
                    <option value="low">Low-capacity mode</option>
                  </select>
                  <input style={inputStyle} value={(strategy.capacityMode?.currentConstraints || []).join(', ')} onChange={(e) => setStrategy((prev) => ({ ...prev, capacityMode: { ...prev.capacityMode, currentConstraints: e.target.value.split(',').map((item) => item.trim()).filter(Boolean) } }))} placeholder="Current constraints" />
                </div>
                <textarea style={{ ...inputStyle, minHeight: 62 }} value={(strategy.capacityMode?.highCapacityPlan || []).join('\n')} onChange={(e) => setStrategy((prev) => ({ ...prev, capacityMode: { ...prev.capacityMode, highCapacityPlan: e.target.value.split(/\r?\n/).filter(Boolean) } }))} placeholder="High-capacity mode plan" />
                <textarea style={{ ...inputStyle, minHeight: 62 }} value={(strategy.capacityMode?.lowCapacityPlan || []).join('\n')} onChange={(e) => setStrategy((prev) => ({ ...prev, capacityMode: { ...prev.capacityMode, lowCapacityPlan: e.target.value.split(/\r?\n/).filter(Boolean) } }))} placeholder="Low-capacity mode plan" />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <input style={inputStyle} value={strategy.platformRules?.tiktok || ''} onChange={(e) => setStrategy((prev) => ({ ...prev, platformRules: { ...prev.platformRules, tiktok: e.target.value } }))} placeholder="TikTok wrapper rule" />
                  <input style={inputStyle} value={strategy.platformRules?.instagram || ''} onChange={(e) => setStrategy((prev) => ({ ...prev, platformRules: { ...prev.platformRules, instagram: e.target.value } }))} placeholder="Instagram wrapper rule" />
                </div>
              </div>
            </Section>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            <Section title="OFFER MAP" subtitle="One service, one problem, one magnet, one CTA path.">
              <div style={{ display: 'grid', gap: 8 }}>
                <input style={inputStyle} placeholder="Offer name" value={offer.name} onChange={(e) => setOffer((prev) => ({ ...prev, name: e.target.value }))} />
                <input style={inputStyle} placeholder="Service" value={offer.service} onChange={(e) => setOffer((prev) => ({ ...prev, service: e.target.value }))} />
                <input style={inputStyle} placeholder="Lead magnet" value={offer.leadMagnet} onChange={(e) => setOffer((prev) => ({ ...prev, leadMagnet: e.target.value }))} />
                <input style={inputStyle} placeholder="Customer problem" value={offer.customerProblem} onChange={(e) => setOffer((prev) => ({ ...prev, customerProblem: e.target.value }))} />
                <input style={inputStyle} placeholder="CTA path" value={offer.ctaPath} onChange={(e) => setOffer((prev) => ({ ...prev, ctaPath: e.target.value }))} />
                <input style={inputStyle} placeholder="Content pillar" value={offer.contentPillar} onChange={(e) => setOffer((prev) => ({ ...prev, contentPillar: e.target.value }))} />
                <input style={inputStyle} placeholder="Landing page language" value={offer.landingPageLanguage} onChange={(e) => setOffer((prev) => ({ ...prev, landingPageLanguage: e.target.value }))} />
                <input style={inputStyle} placeholder="Sales promise" value={offer.salesPromise} onChange={(e) => setOffer((prev) => ({ ...prev, salesPromise: e.target.value }))} />
                <input style={inputStyle} placeholder="Continuity notes" value={offer.continuityNotes} onChange={(e) => setOffer((prev) => ({ ...prev, continuityNotes: e.target.value }))} />
                <button onClick={async () => { await post('addOffer', { offer }); setOffer(defaultOffer); }} disabled={saving} style={buttonStyle('#22d3ee')}>Add Offer</button>
                <div style={{ maxHeight: 180, overflowY: 'auto', display: 'grid', gap: 6 }}>
                  {(state.offers || []).slice(0, 6).map((item) => (
                    <div key={item.id} style={miniCardStyle}>
                      <div style={{ color: '#fff', fontWeight: 700 }}>{item.name || item.service}</div>
                      <div style={{ fontSize: 11, color: '#9ca3af' }}>{item.customerProblem}</div>
                      <div style={{ fontSize: 11, color: '#67e8f9' }}>{item.leadMagnet}{' -> '}{item.ctaPath}</div>
                      <div style={{ fontSize: 11, color: '#fbbf24' }}>{item.landingPageLanguage || item.salesPromise}</div>
                    </div>
                  ))}
                </div>
              </div>
            </Section>

            <Section title="PROOF + CLAIMS" subtitle="Authority content needs proof and safe claim handling.">
              <div style={{ display: 'grid', gap: 8 }}>
                <input style={inputStyle} placeholder="Proof title" value={proof.title} onChange={(e) => setProof((prev) => ({ ...prev, title: e.target.value }))} />
                <input style={inputStyle} placeholder="Metric or result" value={proof.metric} onChange={(e) => setProof((prev) => ({ ...prev, metric: e.target.value }))} />
                <textarea style={{ ...inputStyle, minHeight: 56 }} placeholder="Proof summary" value={proof.summary} onChange={(e) => setProof((prev) => ({ ...prev, summary: e.target.value }))} />
                <button onClick={async () => { await post('addProof', { proof: { ...proof, tags: proof.tags } }); setProof(defaultProof); }} disabled={saving} style={buttonStyle('#10b981')}>Add Proof</button>
                <input style={inputStyle} placeholder="Claim" value={claim.claim} onChange={(e) => setClaim((prev) => ({ ...prev, claim: e.target.value }))} />
                <select style={inputStyle} value={claim.claimType} onChange={(e) => setClaim((prev) => ({ ...prev, claimType: e.target.value }))}>
                  <option value="approved">Approved</option>
                  <option value="unverified">Unverified</option>
                  <option value="forbidden">Forbidden</option>
                </select>
                <input style={inputStyle} placeholder="Evidence" value={claim.evidence} onChange={(e) => setClaim((prev) => ({ ...prev, evidence: e.target.value }))} />
                <input style={inputStyle} placeholder="Safer version" value={claim.saferVersion} onChange={(e) => setClaim((prev) => ({ ...prev, saferVersion: e.target.value }))} />
                <button onClick={async () => { await post('addClaim', { claim }); setClaim(defaultClaim); }} disabled={saving} style={buttonStyle('#f59e0b')}>Add Claim</button>
              </div>
            </Section>

            <Section title="LOSERS + OBJECTIONS" subtitle="Store bad patterns and sales friction, not just winners.">
              <div style={{ display: 'grid', gap: 8 }}>
                <input style={inputStyle} placeholder="Weak pattern" value={pattern.pattern} onChange={(e) => setPattern((prev) => ({ ...prev, pattern: e.target.value }))} />
                <input style={inputStyle} placeholder="Why it fails" value={pattern.whyItFails} onChange={(e) => setPattern((prev) => ({ ...prev, whyItFails: e.target.value }))} />
                <input style={inputStyle} placeholder="Avoid rule" value={pattern.avoidRule} onChange={(e) => setPattern((prev) => ({ ...prev, avoidRule: e.target.value }))} />
                <button onClick={async () => { await post('addNegativePattern', { pattern }); setPattern(defaultPattern); }} disabled={saving} style={buttonStyle('#ef4444')}>Add Negative Pattern</button>
                <input style={inputStyle} placeholder="Objection" value={objection.objection} onChange={(e) => setObjection((prev) => ({ ...prev, objection: e.target.value }))} />
                <input style={inputStyle} placeholder="Response angle" value={objection.responseAngle} onChange={(e) => setObjection((prev) => ({ ...prev, responseAngle: e.target.value }))} />
                <button onClick={async () => { await post('addObjection', { objection }); setObjection(defaultObjection); }} disabled={saving} style={buttonStyle('#8b5cf6')}>Add Objection</button>
              </div>
            </Section>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 14 }}>
            <Section title="TOPIC SCORING + SERIES ENGINE" subtitle="Score ideas before scripting, then expand winners into a series.">
              <div style={{ display: 'grid', gap: 8 }}>
                <input style={inputStyle} placeholder="Topic title" value={topic.title} onChange={(e) => setTopic((prev) => ({ ...prev, title: e.target.value }))} />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                  <select style={inputStyle} value={topic.lane} onChange={(e) => setTopic((prev) => ({ ...prev, lane: e.target.value }))}>
                    <option value="reach">Reach</option>
                    <option value="trust">Trust</option>
                    <option value="conversion">Conversion</option>
                    <option value="retention">Retention</option>
                    <option value="proof">Proof</option>
                  </select>
                  <select style={inputStyle} value={topic.journeyStage} onChange={(e) => setTopic((prev) => ({ ...prev, journeyStage: e.target.value }))}>
                    <option value="unaware">Unaware</option>
                    <option value="problem-aware">Problem aware</option>
                    <option value="solution-aware">Solution aware</option>
                    <option value="product-aware">Product aware</option>
                    <option value="ready-to-buy">Ready to buy</option>
                  </select>
                  <select style={inputStyle} value={topic.trendLane} onChange={(e) => setTopic((prev) => ({ ...prev, trendLane: e.target.value }))}>
                    <option value="evergreen">Evergreen</option>
                    <option value="trend-reactive">Trend reactive</option>
                  </select>
                  <select style={inputStyle} value={topic.status} onChange={(e) => setTopic((prev) => ({ ...prev, status: e.target.value }))}>
                    <option value="idea_backlog">Idea backlog</option>
                    <option value="ready_queue">Ready queue</option>
                    <option value="production_queue">Production queue</option>
                  </select>
                </div>
                <input style={inputStyle} placeholder="Content pillar" value={topic.contentPillar} onChange={(e) => setTopic((prev) => ({ ...prev, contentPillar: e.target.value }))} />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                  <select style={inputStyle} value={topic.productionLift} onChange={(e) => setTopic((prev) => ({ ...prev, productionLift: e.target.value }))}>
                    <option value="low">Low production lift</option>
                    <option value="medium">Medium production lift</option>
                    <option value="high">High production lift</option>
                  </select>
                  <select style={inputStyle} value={topic.onCameraIntensity} onChange={(e) => setTopic((prev) => ({ ...prev, onCameraIntensity: e.target.value }))}>
                    <option value="low">Low on-camera demand</option>
                    <option value="medium">Medium on-camera demand</option>
                    <option value="high">High on-camera demand</option>
                  </select>
                  <input style={inputStyle} placeholder="Format bias" value={topic.formatBias} onChange={(e) => setTopic((prev) => ({ ...prev, formatBias: e.target.value }))} />
                  <label style={checkLabel}><input type="checkbox" checked={topic.repurposeReady} onChange={(e) => setTopic((prev) => ({ ...prev, repurposeReady: e.target.checked }))} /> Repurpose-ready</label>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                  {[
                    ['audiencePain', 'Pain'],
                    ['offerRelevance', 'Offer'],
                    ['proofAvailability', 'Proof'],
                    ['easeOfFilming', 'Film'],
                    ['shareSavePotential', 'Share'],
                    ['qualifiedLeadPotential', 'Lead'],
                    ['freshness', 'Fresh'],
                    ['repeatability', 'Series'],
                  ].map(([key, label]) => (
                    <label key={key} style={{ fontSize: 11, color: '#aaa' }}>
                      {label}
                      <input type="number" min="0" max="10" style={{ ...inputStyle, marginTop: 4 }} value={topic[key]} onChange={(e) => setTopic((prev) => ({ ...prev, [key]: e.target.value }))} />
                    </label>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={async () => { const data = await post('addTopic', { topic }); setSeriesPreview([]); setTopic(defaultTopic); return data; }} disabled={saving} style={buttonStyle('#22d3ee')}>Save Topic</button>
                  <button onClick={async () => { const data = await post('generateSeries', { title: topic.title }); setSeriesPreview(data.variants || []); }} disabled={saving || !topic.title.trim()} style={buttonStyle('#a78bfa')}>Generate Series</button>
                </div>
              </div>
            </Section>

            <Section title="QUEUE + BALANCE" subtitle="Move from smart notes to a real operating queue.">
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ ...miniCardStyle, border: '1px solid rgba(34,211,238,0.18)' }}>
                  <div style={{ color: '#22d3ee', fontWeight: 700 }}>Capacity mode: {(summary?.capacityMode || 'high').toUpperCase()}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>Queue ranking now shifts toward lower-lift topics when capacity is low.</div>
                </div>
                {(summary?.portfolioBalance || []).map((item) => (
                  <div key={item.lane} style={miniCardStyle}>
                    <div style={{ color: '#fff', fontWeight: 700, textTransform: 'capitalize' }}>{item.lane}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>Current {item.currentCount} / Target {item.target}%</div>
                  </div>
                ))}
                {queue.slice(0, 6).map((item) => (
                  <div key={item.id} style={miniCardStyle}>
                    <div style={{ color: '#fff', fontWeight: 700 }}>{item.title}</div>
                    <div style={{ fontSize: 11, color: '#67e8f9' }}>{item.status} | {item.lane} | {item.journeyStage}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>Queue score {item.queueScore} | Base {item.weightedScore}</div>
                    <div style={{ fontSize: 11, color: '#fbbf24' }}>{item.capacityReason}</div>
                  </div>
                ))}
              </div>
            </Section>
          </div>

          {seriesPreview.length > 0 && (
            <Section title="SERIES PREVIEW" subtitle="One winning idea should create multiple assets by default.">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {seriesPreview.map((item) => <div key={item} style={miniCardStyle}>{item}</div>)}
              </div>
            </Section>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Section title="LEAD QUALITY FEEDBACK" subtitle="Teach the system which content attracts buyers, not just views.">
              <div style={{ display: 'grid', gap: 8 }}>
                <input style={inputStyle} placeholder="Source post or asset" value={lead.sourcePost} onChange={(e) => setLead((prev) => ({ ...prev, sourcePost: e.target.value }))} />
                <input style={inputStyle} placeholder="Hook" value={lead.hook} onChange={(e) => setLead((prev) => ({ ...prev, hook: e.target.value }))} />
                <input style={inputStyle} placeholder="CTA" value={lead.cta} onChange={(e) => setLead((prev) => ({ ...prev, cta: e.target.value }))} />
                <input style={inputStyle} placeholder="Offer wanted" value={lead.offerWanted} onChange={(e) => setLead((prev) => ({ ...prev, offerWanted: e.target.value }))} />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  <label style={checkLabel}><input type="checkbox" checked={lead.qualified} onChange={(e) => setLead((prev) => ({ ...prev, qualified: e.target.checked }))} /> Qualified</label>
                  <label style={checkLabel}><input type="checkbox" checked={lead.booked} onChange={(e) => setLead((prev) => ({ ...prev, booked: e.target.checked }))} /> Booked</label>
                  <label style={checkLabel}><input type="checkbox" checked={lead.bought} onChange={(e) => setLead((prev) => ({ ...prev, bought: e.target.checked }))} /> Bought</label>
                </div>
                <input style={inputStyle} placeholder="Deal size" value={lead.dealSize} onChange={(e) => setLead((prev) => ({ ...prev, dealSize: e.target.value }))} />
                <textarea style={{ ...inputStyle, minHeight: 60 }} placeholder="Why they said yes or no" value={lead.decisionReason} onChange={(e) => setLead((prev) => ({ ...prev, decisionReason: e.target.value }))} />
                <button onClick={async () => { await post('addLeadFeedback', { lead }); setLead(defaultLead); }} disabled={saving} style={buttonStyle('#10b981')}>Add Lead Feedback</button>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>
                  Qualified {summary?.leadQuality?.qualifiedRate || 0}% | Booked {summary?.leadQuality?.bookedRate || 0}% | Closed {summary?.leadQuality?.closeRate || 0}%
                </div>
              </div>
            </Section>

            <Section title="RECENT MEMORY" subtitle="Proof, claims, objections, and lost patterns feed future prompts automatically.">
              <div style={{ display: 'grid', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
                {(state.proofLibrary || []).slice(0, 3).map((item) => (
                  <div key={item.id} style={miniCardStyle}>
                    <div style={{ color: '#10b981', fontWeight: 700 }}>{item.title}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>{item.summary || item.metric}</div>
                  </div>
                ))}
                {(state.claimRegistry || []).slice(0, 3).map((item) => (
                  <div key={item.id} style={miniCardStyle}>
                    <div style={{ color: item.claimType === 'forbidden' ? '#ef4444' : item.claimType === 'approved' ? '#22d3ee' : '#f59e0b', fontWeight: 700 }}>{item.claimType.toUpperCase()}</div>
                    <div style={{ fontSize: 11, color: '#fff' }}>{item.claim}</div>
                  </div>
                ))}
                {(state.negativePatterns || []).slice(0, 3).map((item) => (
                  <div key={item.id} style={miniCardStyle}>
                    <div style={{ color: '#ef4444', fontWeight: 700 }}>{item.pattern}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>{item.avoidRule || item.whyItFails}</div>
                  </div>
                ))}
                {(state.objections || []).slice(0, 3).map((item) => (
                  <div key={item.id} style={miniCardStyle}>
                    <div style={{ color: '#a78bfa', fontWeight: 700 }}>{item.objection}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>{item.responseAngle}</div>
                  </div>
                ))}
              </div>
            </Section>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            <Section title="EXPERIMENTS" subtitle="Structured testing beats random posting.">
              <div style={{ display: 'grid', gap: 8 }}>
                <input style={inputStyle} placeholder="Experiment name" value={experiment.name} onChange={(e) => setExperiment((prev) => ({ ...prev, name: e.target.value }))} />
                <input style={inputStyle} placeholder="Variable being tested" value={experiment.variable} onChange={(e) => setExperiment((prev) => ({ ...prev, variable: e.target.value }))} />
                <input style={inputStyle} placeholder="What stays constant" value={experiment.constant} onChange={(e) => setExperiment((prev) => ({ ...prev, constant: e.target.value }))} />
                <input style={inputStyle} placeholder="Winner metric" value={experiment.winnerMetric} onChange={(e) => setExperiment((prev) => ({ ...prev, winnerMetric: e.target.value }))} />
                <input style={inputStyle} placeholder="Scale threshold" value={experiment.scaleThreshold} onChange={(e) => setExperiment((prev) => ({ ...prev, scaleThreshold: e.target.value }))} />
                <button onClick={async () => { await post('addExperiment', { experiment }); setExperiment(defaultExperiment); }} disabled={saving} style={buttonStyle('#a78bfa')}>Add Experiment</button>
              </div>
            </Section>

            <Section title="PRODUCTION REALITY" subtitle="Optimize for repeatability in the field, not just theory.">
              <div style={{ display: 'grid', gap: 8 }}>
                <input style={inputStyle} placeholder="What happened in production" value={reality.finding} onChange={(e) => setReality((prev) => ({ ...prev, finding: e.target.value }))} />
                <input style={inputStyle} placeholder="Implication" value={reality.implication} onChange={(e) => setReality((prev) => ({ ...prev, implication: e.target.value }))} />
                <textarea style={{ ...inputStyle, minHeight: 56 }} placeholder="Notes" value={reality.notes} onChange={(e) => setReality((prev) => ({ ...prev, notes: e.target.value }))} />
                <button onClick={async () => { await post('addProductionReality', { entry: reality }); setReality(defaultReality); }} disabled={saving} style={buttonStyle('#f97316')}>Add Reality Note</button>
              </div>
            </Section>

            <Section title="WHAT NOT TO DO" subtitle="Formalize the anti-fluff positioning engine.">
              <div style={{ display: 'grid', gap: 8 }}>
                <input style={inputStyle} placeholder="Bad advice or vanity task" value={antiFluff.myth} onChange={(e) => setAntiFluff((prev) => ({ ...prev, myth: e.target.value }))} />
                <input style={inputStyle} placeholder="Why it is wrong" value={antiFluff.whyWrong} onChange={(e) => setAntiFluff((prev) => ({ ...prev, whyWrong: e.target.value }))} />
                <input style={inputStyle} placeholder="Better replacement" value={antiFluff.replacement} onChange={(e) => setAntiFluff((prev) => ({ ...prev, replacement: e.target.value }))} />
                <button onClick={async () => { await post('addAntiFluff', { entry: antiFluff }); setAntiFluff(defaultAntiFluff); }} disabled={saving} style={buttonStyle('#ef4444')}>Add Anti-Fluff Rule</button>
              </div>
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}

function buttonStyle(color) {
  return {
    padding: '9px 12px',
    background: `${color}22`,
    border: `1px solid ${color}66`,
    borderRadius: 4,
    color,
    cursor: 'pointer',
    fontSize: 11,
    fontWeight: 700,
  };
}

const miniCardStyle = {
  padding: 10,
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 4,
};

const checkLabel = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 11,
  color: '#d1d5db',
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 4,
  padding: '8px 10px',
};
