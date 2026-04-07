'use client';
import { useEffect, useMemo, useState } from 'react';

const COLORS = ['#f59e0b', '#3b82f6', '#ec4899', '#10b981', '#8b5cf6', '#ef4444', '#06b6d4', '#ffffff'];
const STEPS = ['Offer', 'Message', 'Look', 'Build'];

const DEFAULT_FORM = {
  clientId: 'cli_default',
  campaignId: 'cmp_default',
  offerId: 'off_default',
  clientName: '',
  niche: '',
  headline: '',
  subheadline: '',
  benefits: '',
  process: '',
  primaryOutcome: '',
  leadMagnetLine: '',
  objectionBullets: '',
  testimonials: '',
  cta: 'Book Your Free Strategy Call',
  ctaId: 'cta_default',
  ctaKeyword: 'GUIDE',
  landingPageType: 'booking',
  color: '#f59e0b',
  darkMode: true,
  includeVSL: false,
  sourcePrompt: '',
  visualTheme: 'Sparse high-conversion landing page with one dominant proof image and no generic SaaS cards',
  strategyNotes: '',
  model: 'qwen2.5:14b',
};

export default function LandingPageBuilder({ onClose, initialAssetId = '' }) {
  const [step, setStep] = useState(1);
  const [viewportWidth, setViewportWidth] = useState(1280);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [previewHtml, setPreviewHtml] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [pageContext, setPageContext] = useState(null);
  const [contextStatus, setContextStatus] = useState('');
  const [form, setForm] = useState(DEFAULT_FORM);

  const isMobile = viewportWidth <= 900;
  const activeStepLabel = STEPS[step - 1] || 'Build';

  const inputStyle = useMemo(() => ({
    width: '100%',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10,
    color: '#e2e2e8',
    padding: '10px 12px',
    fontSize: 12,
    fontFamily: 'JetBrains Mono, monospace',
    outline: 'none',
    marginBottom: 10,
  }), []);

  const labelStyle = useMemo(() => ({
    fontSize: 9,
    color: '#738396',
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    display: 'block',
    marginBottom: 5,
  }), []);

  const update = (key, val) => setForm((prev) => ({ ...prev, [key]: val }));

  useEffect(() => {
    loadLatestPipelineContext(initialAssetId);
  }, [initialAssetId]);

  useEffect(() => {
    const updateViewport = () => setViewportWidth(window.innerWidth);
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  const applyPageContext = (context) => {
    if (!context) return;
    setForm((prev) => ({
      ...prev,
      clientId: context.clientId || prev.clientId,
      campaignId: context.campaignId || prev.campaignId,
      offerId: context.offerId || prev.offerId,
      clientName: context.clientName || prev.clientName,
      niche: context.niche || prev.niche,
      headline: context.headline || prev.headline,
      subheadline: context.subheadline || prev.subheadline,
      benefits: (context.benefits || []).join('\n') || prev.benefits,
      process: (context.process || []).join('\n') || prev.process,
      primaryOutcome: context.offerName ? `More ${context.offerName.toLowerCase()} inquiries` : prev.primaryOutcome,
      objectionBullets: (context.benefits || []).slice(0, 3).join('\n') || prev.objectionBullets,
      ctaId: context.ctaId || prev.ctaId,
      sourcePrompt: context.sourcePrompt || prev.sourcePrompt,
      strategyNotes: context.strategyNotes || prev.strategyNotes,
    }));
  };

  const loadLatestPipelineContext = async (assetId = '') => {
    try {
      setContextStatus('Loading latest pipeline context...');
      const query = assetId ? `?assetId=${encodeURIComponent(assetId)}` : '';
      const res = await fetch(`/api/page-context${query}`);
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'No pipeline context available');
      setPageContext(data.pageContext);
      applyPageContext(data.pageContext);
      setContextStatus(`Loaded context from asset ${data.pageContext.assetId}`);
    } catch (err) {
      setPageContext(null);
      setContextStatus(err.message || 'No pipeline context available');
    }
  };

  const buildPage = async () => {
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/landingpage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to build landing page');
      setResult(data);
      setPreviewHtml(data.html || '');
    } catch (err) {
      setError(err.message || 'Failed to build landing page');
    } finally {
      setLoading(false);
    }
  };

  const downloadPage = () => {
    if (!result?.html) return;
    const blob = new Blob([result.html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = result.filename || 'landing-page.html';
    link.click();
    URL.revokeObjectURL(url);
  };

  const resetForAnother = () => {
    setResult(null);
    setPreviewHtml('');
    setShowPreview(false);
    setStep(1);
    setForm((prev) => ({
      ...DEFAULT_FORM,
      clientId: prev.clientId,
      campaignId: prev.campaignId,
      ctaId: prev.ctaId,
      sourcePrompt: '',
      strategyNotes: '',
    }));
    if (pageContext) applyPageContext(pageContext);
  };

  const shellButton = (active) => ({
    flex: 1,
    padding: '10px 0',
    borderRadius: 999,
    border: `1px solid ${active ? 'rgba(16,185,129,0.35)' : 'rgba(255,255,255,0.08)'}`,
    background: active ? 'rgba(16,185,129,0.14)' : 'rgba(255,255,255,0.03)',
    color: active ? '#10b981' : '#7e8696',
    fontFamily: 'Orbitron, sans-serif',
    fontSize: 10,
    letterSpacing: '0.1em',
    cursor: 'pointer',
  });

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(3,4,8,0.92)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: isMobile ? 12 : 24,
      }}
    >
      <div
        style={{
          background: 'linear-gradient(180deg, rgba(13,13,20,0.98), rgba(8,10,16,0.98))',
          border: '1px solid rgba(16,185,129,0.22)',
          borderRadius: 18,
          width: '100%',
          maxWidth: showPreview ? (isMobile ? '100%' : '95vw') : (isMobile ? '100%' : 680),
          maxHeight: '92vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 36px 100px rgba(0,0,0,0.5)',
          transition: 'max-width 0.25s ease',
        }}
      >
        <div
          style={{
            padding: isMobile ? '18px 16px 14px' : '22px 24px 18px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1.2fr auto',
            alignItems: 'end',
            gap: 16,
            background: 'radial-gradient(circle at top left, rgba(16,185,129,0.18), transparent 36%), radial-gradient(circle at top right, rgba(59,130,246,0.12), transparent 34%)',
          }}
        >
          <div>
            <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 13, fontWeight: 700, color: '#10b981', letterSpacing: '0.14em' }}>
              WEBSITE STUDIO
            </div>
            <div style={{ fontSize: isMobile ? 20 : 24, color: '#f4f7fb', marginTop: 8, fontWeight: 700, lineHeight: 1.08 }}>
              Build the shortest path from promise to qualified lead.
            </div>
            <div style={{ fontSize: 11, color: '#81909f', marginTop: 10, lineHeight: 1.7, maxWidth: 500 }}>
              Start with the outcome promise, add just enough context and proof, then keep every section accountable to qualified opt-ins.
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifySelf: isMobile ? 'start' : 'end', flexWrap: 'wrap', width: isMobile ? '100%' : 'auto' }}>
            <div style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)' }}>
              <div style={{ fontSize: 9, color: '#738396', letterSpacing: '0.14em' }}>ACTIVE STEP</div>
              <div style={{ marginTop: 4, fontFamily: 'Orbitron, sans-serif', fontSize: 11, color: '#f4f7fb', letterSpacing: '0.08em' }}>
                {activeStepLabel.toUpperCase()}
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#9ba7b8',
                padding: '8px 14px',
                borderRadius: 999,
                cursor: 'pointer',
                fontSize: 11,
                fontFamily: 'JetBrains Mono, monospace',
                letterSpacing: '0.08em',
              }}
            >
              CLOSE
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', padding: isMobile ? '12px 12px 14px' : '14px 20px', gap: 8, flexWrap: 'wrap', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {STEPS.map((item, index) => (
            <div
              key={item}
              onClick={() => !loading && setStep(index + 1)}
              style={{
                flex: isMobile ? '1 1 calc(50% - 8px)' : 1,
                textAlign: 'center',
                padding: '10px 0',
                border: `1px solid ${step === index + 1 ? 'rgba(16,185,129,0.28)' : 'rgba(255,255,255,0.06)'}`,
                background: step === index + 1 ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.02)',
                borderRadius: 999,
                color: step === index + 1 ? '#10b981' : step > index + 1 ? '#7e8696' : '#475063',
                fontFamily: 'Orbitron, sans-serif',
                fontSize: 9,
                letterSpacing: '0.1em',
                cursor: 'pointer',
              }}
            >
              {(step > index + 1 ? 'DONE | ' : '') + item.toUpperCase()}
            </div>
          ))}
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: isMobile ? 14 : 22 }}>
          {showPreview && previewHtml ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <iframe
                srcDoc={previewHtml}
                style={{ width: '100%', height: isMobile ? '56vh' : '60vh', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16 }}
                title="Landing Page Preview"
              />
              <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8 }}>
                <button onClick={downloadPage} style={{ ...shellButton(true) }}>DOWNLOAD HTML</button>
                <button onClick={() => setShowPreview(false)} style={{ ...shellButton(false), flex: isMobile ? 1 : '0 0 180px' }}>BACK TO BUILDER</button>
              </div>
            </div>
          ) : (
            <div>
              {step === 1 && (
                <div>
                  <div style={{ fontSize: 11, color: '#7a8596', marginBottom: 16, lineHeight: 1.7 }}>
                    Start with the client, niche, and outcome. This should make the offer and goal unambiguous before design enters the picture.
                  </div>

                  <label style={labelStyle}>Website Prompt</label>
                  {pageContext ? (
                    <div style={{ padding: 10, marginBottom: 10, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.18)', borderRadius: 14, fontSize: 11, color: '#b5f4d1', lineHeight: 1.6 }}>
                      Pipeline context loaded from <strong>{pageContext.assetId}</strong> for <strong>{pageContext.topic}</strong>.
                      <div style={{ color: '#5d8b6f', marginTop: 4 }}>{contextStatus}</div>
                    </div>
                  ) : contextStatus ? (
                    <div style={{ padding: 10, marginBottom: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, fontSize: 11, color: '#9097a5' }}>
                      {contextStatus}
                    </div>
                  ) : null}

                  <button onClick={() => loadLatestPipelineContext()} style={{ width: '100%', padding: '8px 0', marginBottom: 10, background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 999, color: '#60a5fa', fontFamily: 'Orbitron, sans-serif', fontSize: 10, letterSpacing: '0.08em', cursor: 'pointer' }}>
                    LOAD LATEST PIPELINE CONTEXT
                  </button>

                  <textarea
                    style={{ ...inputStyle, minHeight: 110, resize: 'vertical' }}
                    value={form.sourcePrompt}
                    onChange={(e) => update('sourcePrompt', e.target.value)}
                    placeholder="Build a landing page for a dog trainer that promises calmer walks and better obedience. Keep it sparse, mobile-first, and focused on booking qualified consults."
                  />

                  <label style={labelStyle}>Client / Business Name</label>
                  <input style={inputStyle} value={form.clientName} onChange={(e) => update('clientName', e.target.value)} placeholder="Smith Photography" />

                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8 }}>
                    <div>
                      <label style={labelStyle}>Client ID</label>
                      <input style={inputStyle} value={form.clientId} onChange={(e) => update('clientId', e.target.value)} placeholder="cli_default" />
                    </div>
                    <div>
                      <label style={labelStyle}>Campaign ID</label>
                      <input style={inputStyle} value={form.campaignId} onChange={(e) => update('campaignId', e.target.value)} placeholder="cmp_default" />
                    </div>
                  </div>

                  <label style={labelStyle}>Niche</label>
                  <input style={inputStyle} value={form.niche} onChange={(e) => update('niche', e.target.value)} placeholder="Dog training for busy families" />

                  <label style={labelStyle}>Primary Outcome</label>
                  <input style={inputStyle} value={form.primaryOutcome} onChange={(e) => update('primaryOutcome', e.target.value)} placeholder="More qualified training consults" />

                  <label style={labelStyle}>Main Call To Action</label>
                  <input style={inputStyle} value={form.cta} onChange={(e) => update('cta', e.target.value)} placeholder="Get a custom training plan by booking a consult" />

                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8 }}>
                    <div>
                      <label style={labelStyle}>CTA ID</label>
                      <input style={inputStyle} value={form.ctaId} onChange={(e) => update('ctaId', e.target.value)} placeholder="cta_default" />
                    </div>
                    <div>
                      <label style={labelStyle}>CTA Keyword</label>
                      <input style={inputStyle} value={form.ctaKeyword} onChange={(e) => update('ctaKeyword', e.target.value)} placeholder="GUIDE" />
                    </div>
                  </div>

                  <label style={labelStyle}>Strategy Notes</label>
                  <textarea
                    style={{ ...inputStyle, minHeight: 100, resize: 'vertical' }}
                    value={form.strategyNotes}
                    onChange={(e) => update('strategyNotes', e.target.value)}
                    placeholder="Add anything that sharpens the audience, urgency, or qualification standard."
                  />

                  <button onClick={() => setStep(2)} style={{ width: '100%', padding: '10px 0', marginTop: 8, ...shellButton(true) }}>
                    NEXT | CONTENT
                  </button>
                </div>
              )}

              {step === 2 && (
                <div>
                  <div style={{ fontSize: 11, color: '#7a8596', marginBottom: 16, lineHeight: 1.7 }}>
                    Lock the promise and the few supporting elements that matter most: context, lead justification, objections, and proof.
                  </div>

                  <label style={labelStyle}>Headline Promise</label>
                  <input style={inputStyle} value={form.headline} onChange={(e) => update('headline', e.target.value)} placeholder="Get calmer walks and better obedience without guessing what to do next" />

                  <label style={labelStyle}>Subheadline Context</label>
                  <input style={inputStyle} value={form.subheadline} onChange={(e) => update('subheadline', e.target.value)} placeholder="Built for busy families who need a clear training plan, proof it works, and an easy next step." />

                  <label style={labelStyle}>Lead Magnet / Form Justification</label>
                  <input style={inputStyle} value={form.leadMagnetLine} onChange={(e) => update('leadMagnetLine', e.target.value)} placeholder="Answer a few quick questions and we will recommend the right training path." />

                  <label style={labelStyle}>Three Objection Bullets</label>
                  <textarea style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }} value={form.objectionBullets} onChange={(e) => update('objectionBullets', e.target.value)} placeholder={'You do not need more dog tips. You need a plan.\nThe form qualifies fit before the consult.\nEverything points to one next step.'} />

                  <label style={labelStyle}>Supporting Benefits / Notes</label>
                  <textarea style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }} value={form.benefits} onChange={(e) => update('benefits', e.target.value)} placeholder={'Promise-matched page copy\nFaster qualification\nClearer CTA handoff'} />

                  <label style={labelStyle}>Optional Social Proof</label>
                  <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} value={form.testimonials} onChange={(e) => update('testimonials', e.target.value)} placeholder={'Only add this if it helps a complex offer.\nWe stopped attracting browsers and started attracting buyers. - Founder'} />

                  <label style={labelStyle}>Qualification / Process Notes</label>
                  <textarea style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }} value={form.process} onChange={(e) => update('process', e.target.value)} placeholder={'Keep the form to 4-5 fields\nFocus the page on one CTA\nUse the hero image as proof'} />

                  <div style={{ display: 'flex', flexDirection: isMobile ? 'column-reverse' : 'row', gap: 8, marginTop: 8 }}>
                    <button onClick={() => setStep(1)} style={{ ...shellButton(false), flex: isMobile ? 1 : '0 0 180px' }}>BACK</button>
                    <button onClick={() => setStep(3)} style={{ ...shellButton(true) }}>NEXT | DESIGN</button>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div>
                  <div style={{ fontSize: 11, color: '#7a8596', marginBottom: 16, lineHeight: 1.7 }}>
                    Pick the visual world, but keep it restrained. The page should feel intentional, sparse, and conversion-first.
                  </div>

                  <label style={labelStyle}>Visual Direction</label>
                  <select value={form.visualTheme} onChange={(e) => update('visualTheme', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                    <option value="Sparse high-conversion landing page with one dominant proof image and no generic SaaS cards">Sparse / High conversion</option>
                    <option value="Cinematic proof-led landing page with strong photography and decisive type">Cinematic proof-led</option>
                    <option value="Editorial landing page with bold hierarchy and calm whitespace">Editorial / Modern</option>
                    <option value="Minimal landing page with almost nothing beyond the promise, proof, and CTA">Minimal / Quiet</option>
                    <option value="Studio-tech landing page with sharp hierarchy and a serious conversion feel">Studio / Tech</option>
                  </select>

                  <label style={labelStyle}>Accent Color</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                    {COLORS.map((color) => (
                      <button
                        key={color}
                        onClick={() => update('color', color)}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          background: color,
                          cursor: 'pointer',
                          border: form.color === color ? '3px solid #fff' : '2px solid transparent',
                        }}
                      />
                    ))}
                  </div>

                  <label style={labelStyle}>Theme</label>
                  <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8, marginBottom: 16 }}>
                    {['Dark', 'Light'].map((tone) => (
                      <button key={tone} onClick={() => update('darkMode', tone === 'Dark')} style={shellButton((tone === 'Dark') === form.darkMode)}>
                        {tone.toUpperCase()}
                      </button>
                    ))}
                  </div>

                  <label style={labelStyle}>Include VSL Placeholder</label>
                  <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8, marginBottom: 16 }}>
                    {['Yes', 'No'].map((choice) => (
                      <button key={choice} onClick={() => update('includeVSL', choice === 'Yes')} style={shellButton((choice === 'Yes') === form.includeVSL)}>
                        {choice.toUpperCase()}
                      </button>
                    ))}
                  </div>

                  <label style={labelStyle}>Landing Page Type</label>
                  <select value={form.landingPageType} onChange={(e) => update('landingPageType', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                    <option value="booking">Booking</option>
                    <option value="lead_magnet">Lead Magnet</option>
                    <option value="service">Service</option>
                    <option value="proof_case_study">Proof / Case Study</option>
                    <option value="retargeting">Retargeting</option>
                  </select>

                  <label style={labelStyle}>AI Model</label>
                  <select value={form.model} onChange={(e) => update('model', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                    <option value="qwen2.5:14b">qwen2.5:14b (recommended)</option>
                    <option value="qwen2.5-ctx32k">qwen2.5-ctx32k</option>
                    <option value="deepseek-r1-ctx32k">deepseek-r1-ctx32k</option>
                  </select>

                  <div style={{ display: 'flex', flexDirection: isMobile ? 'column-reverse' : 'row', gap: 8, marginTop: 8 }}>
                    <button onClick={() => setStep(2)} style={{ ...shellButton(false), flex: isMobile ? 1 : '0 0 180px' }}>BACK</button>
                    <button onClick={() => setStep(4)} style={{ ...shellButton(true) }}>NEXT | BUILD</button>
                  </div>
                </div>
              )}

              {step === 4 && (
                <div>
                  <div style={{ padding: 16, marginBottom: 16, background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 14 }}>
                    <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 11, color: '#10b981', marginBottom: 12, letterSpacing: '0.1em' }}>
                      BUILD SUMMARY
                    </div>
                    <div style={{ fontSize: 11, color: '#a3acb9', lineHeight: 1.9 }}>
                      <div>Client: <span style={{ color: '#e2e2e8' }}>{form.clientName || 'Not set'}</span></div>
                      <div>Campaign ID: <span style={{ color: '#e2e2e8' }}>{form.campaignId}</span></div>
                      <div>Niche: <span style={{ color: '#e2e2e8' }}>{form.niche || 'Not set'}</span></div>
                      <div>Primary outcome: <span style={{ color: '#e2e2e8' }}>{form.primaryOutcome || 'Not set'}</span></div>
                      <div>Headline: <span style={{ color: '#e2e2e8' }}>{form.headline || 'AI will generate'}</span></div>
                      <div>CTA keyword: <span style={{ color: '#e2e2e8' }}>{form.ctaKeyword}</span></div>
                      <div>Page type: <span style={{ color: '#e2e2e8' }}>{form.landingPageType}</span></div>
                      <div>Visual style: <span style={{ color: '#e2e2e8' }}>{form.visualTheme}</span></div>
                      <div>Theme: <span style={{ color: '#e2e2e8' }}>{form.darkMode ? 'Dark' : 'Light'}</span></div>
                      <div>Accent: <span style={{ color: form.color }}>{form.color}</span></div>
                      <div>VSL: <span style={{ color: '#e2e2e8' }}>{form.includeVSL ? 'Yes' : 'No'}</span></div>
                      <div>Model: <span style={{ color: '#e2e2e8' }}>{form.model}</span></div>
                    </div>
                  </div>

                  {!result && (
                    <button onClick={buildPage} disabled={loading} style={{ ...shellButton(true), width: '100%', padding: '14px 0', fontSize: 12 }}>
                      {loading ? 'GENERATING PAGE...' : 'GENERATE WEBSITE'}
                    </button>
                  )}

                  {loading && (
                    <div style={{ marginTop: 16, padding: 14, background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 14, fontSize: 11, color: '#10b981', textAlign: 'center', lineHeight: 2 }}>
                      <div>Dev is writing your landing page...</div>
                      <div style={{ color: '#7a8596', fontSize: 10, marginTop: 4 }}>This usually takes 30 to 90 seconds depending on the model.</div>
                    </div>
                  )}

                  {result && (
                    <div>
                      <div style={{ padding: 14, marginBottom: 12, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 14 }}>
                        <div style={{ fontSize: 11, color: '#10b981', marginBottom: 6 }}>Landing page built successfully</div>
                        <div style={{ fontSize: 10, color: '#a3acb9' }}>Saved to: data/workspace/dev/{result.filename}</div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8 }}>
                        <button onClick={() => setShowPreview(true)} style={{ ...shellButton(true) }}>PREVIEW PAGE</button>
                        <button onClick={downloadPage} style={{ ...shellButton(true) }}>DOWNLOAD HTML</button>
                      </div>

                      <button onClick={resetForAnother} style={{ ...shellButton(false), width: '100%', marginTop: 8 }}>
                        BUILD ANOTHER PAGE
                      </button>
                    </div>
                  )}

                  {error ? (
                    <div style={{ marginTop: 12, padding: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 14, fontSize: 11, color: '#ef4444' }}>
                      {error}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
