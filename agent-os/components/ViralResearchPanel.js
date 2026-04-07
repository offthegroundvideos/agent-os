'use client';
import { useEffect, useState } from 'react';

const ALL_PLATFORMS = ['instagram', 'tiktok', 'youtube', 'linkedin'];
const DISCOVERY_PROVIDERS = [
  { id: 'browser_search', label: 'Browser Search' },
  { id: 'firecrawl', label: 'Firecrawl' },
];

const defaultVideo = {
  niche: '',
  platform: 'instagram',
  creatorName: '',
  creatorHandle: '',
  followerCount: '',
  viewCount: '',
  url: '',
  topic: '',
  subject: '',
  visualHook: '',
  writtenHook: '',
  verbalHook: '',
  scriptStructure: '',
  format: 'talking-head',
  editComplexity: 'basic',
  actionableValue: '',
  cta: '',
  keywords: '',
  notes: '',
};

function labelPlatform(platform = '') {
  if (platform === 'tiktok') return 'TikTok';
  if (platform === 'youtube') return 'YouTube';
  if (platform === 'linkedin') return 'LinkedIn';
  return 'Instagram';
}

function summaryText(packet) {
  if (!packet?.notes?.length) return 'No platform notes yet.';
  return packet.notes.join(' ');
}

function formatPlatformSelection(selectedPlatforms) {
  return selectedPlatforms.length ? selectedPlatforms.join(',') : '';
}

export default function ViralResearchPanel({ onClose }) {
  const [summary, setSummary] = useState(null);
  const [packet, setPacket] = useState(null);
  const [videos, setVideos] = useState([]);
  const [saving, setSaving] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [batchCollecting, setBatchCollecting] = useState(false);
  const [query, setQuery] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [creatorUrl, setCreatorUrl] = useState('');
  const [nicheSearch, setNicheSearch] = useState('');
  const [batchUrls, setBatchUrls] = useState('');
  const [batchStatus, setBatchStatus] = useState(null);
  const [selectedPlatforms, setSelectedPlatforms] = useState([...ALL_PLATFORMS]);
  const [selectedDiscoveryProviders, setSelectedDiscoveryProviders] = useState(['browser_search', 'firecrawl']);
  const [activePlatformView, setActivePlatformView] = useState('all');
  const [freshOnly, setFreshOnly] = useState(true);
  const [video, setVideo] = useState(defaultVideo);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async (search = query, platforms = selectedPlatforms, fresh = freshOnly) => {
    const searchParam = search ? `&query=${encodeURIComponent(search)}` : '';
    const platformsParam = formatPlatformSelection(platforms);
    const platformQuery = platformsParam ? `&platforms=${encodeURIComponent(platformsParam)}` : '';
    const freshQuery = fresh ? '&freshOnly=true' : '';
    const [summaryRes, packetRes, videosRes] = await Promise.all([
      fetch(`/api/viral-research?${searchParam ? searchParam.slice(1) : ''}${searchParam && platformQuery ? '&' : ''}${platformQuery ? platformQuery.slice(1) : ''}${freshQuery}`),
      fetch(`/api/viral-research?action=packet${searchParam}${platformQuery}${freshQuery}`),
      fetch(`/api/viral-research?action=videos${searchParam}${platformQuery}${freshQuery}`),
    ]);

    setSummary(await summaryRes.json());
    setPacket(await packetRes.json());
    setVideos(await videosRes.json());
  };

  const saveVideo = async () => {
    setSaving(true);
    try {
      await fetch('/api/viral-research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'addVideo',
          video: {
            ...video,
            keywords: video.keywords.split(',').map(item => item.trim()).filter(Boolean),
          },
        }),
      });
      setVideo(defaultVideo);
      await loadAll();
    } finally {
      setSaving(false);
    }
  };

  const collectFromUrl = async () => {
    if (!sourceUrl.trim()) return;
    setCollecting(true);
    try {
      const res = await fetch('/api/viral-research/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: sourceUrl.trim(),
          niche: video.niche,
          platform: video.platform,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setVideo(prev => ({
        ...prev,
        ...data.draft,
        keywords: (data.draft.keywords || []).join(', '),
      }));
    } finally {
      setCollecting(false);
    }
  };

  const collectBatch = async (mode) => {
    setBatchCollecting(true);
    setBatchStatus(null);
    try {
      const payload = {
        mode,
        niche: video.niche,
        platform: video.platform,
        platforms: selectedPlatforms,
      };

      if (mode === 'urls') {
        payload.urls = batchUrls.split(/\r?\n/).map(item => item.trim()).filter(Boolean);
      }

      if (mode === 'creator') {
        payload.url = creatorUrl.trim();
        payload.maxVideos = 12;
      }

      if (mode === 'niche') {
        payload.niche = nicheSearch.trim() || video.niche;
        payload.maxVideos = 12;
        payload.dateLabel = 'March 31, 2026';
        payload.discoveryProviders = selectedDiscoveryProviders;
      }

      const res = await fetch('/api/viral-research/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      if (data.videos?.length) {
        await fetch('/api/viral-research', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'bulkImport',
            resultsByPlatform: data.resultsByPlatform,
          }),
        });
      }

      const platformSummaryLines = Object.entries(data.platformSummary || {})
        .map(([platform, stats]) => `${labelPlatform(platform)}: ${stats.imported} imported, ${stats.errors} errors, ${stats.skipped} skipped`)
        .join(' | ');
      const providerLine = data.discoveryProvidersUsed?.length
        ? `Providers: ${data.discoveryProvidersUsed.join(', ')}`
        : '';

      setBatchStatus([platformSummaryLines, providerLine].filter(Boolean).join(' | ') || 'No videos were collected from that source.');
      await loadAll(query, selectedPlatforms, freshOnly);
    } finally {
      setBatchCollecting(false);
    }
  };

  const toggleDiscoveryProvider = (provider) => {
    const next = selectedDiscoveryProviders.includes(provider)
      ? selectedDiscoveryProviders.filter(item => item !== provider)
      : [...selectedDiscoveryProviders, provider];
    setSelectedDiscoveryProviders(next.length ? next : ['browser_search']);
  };

  const togglePlatform = (platform) => {
    const next = selectedPlatforms.includes(platform)
      ? selectedPlatforms.filter(item => item !== platform)
      : [...selectedPlatforms, platform];
    setSelectedPlatforms(next);
    if (activePlatformView !== 'all' && !next.includes(activePlatformView)) {
      setActivePlatformView('all');
    }
    loadAll(query, next, freshOnly);
  };

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

  const visibleVideos = activePlatformView === 'all'
    ? videos
    : videos.filter(item => item.platform === activePlatformView);

  const visiblePackets = (packet?.platformPackets || []).filter(item =>
    activePlatformView === 'all' ? true : item.platform === activePlatformView
  );

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 24,
    }}>
      <div style={{
        width: '100%', maxWidth: 1380, maxHeight: '92vh', overflow: 'hidden',
        background: '#0d0d14', border: '1px solid rgba(59,130,246,0.35)',
        borderRadius: 6, boxShadow: '0 0 60px rgba(59,130,246,0.08)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 13, fontWeight: 700, color: '#3b82f6', letterSpacing: '0.1em' }}>
              VIRAL RESEARCH DATABASE
            </div>
            <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>
              Platform-native research first, cross-platform themes second.
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: '1px solid #333', color: '#888',
            padding: '5px 12px', borderRadius: 3, cursor: 'pointer', fontSize: 11,
          }}>X</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 0, minHeight: 0, flex: 1 }}>
          <div style={{ borderRight: '1px solid rgba(255,255,255,0.06)', padding: 16, overflowY: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                {[
                  { label: 'Videos', value: summary?.totalVideos || 0 },
                  { label: '5x Winners', value: summary?.qualifyingVideos || 0 },
                  { label: 'Breakout Now', value: summary?.breakoutNowVideos || 0 },
                  { label: 'Platforms', value: summary?.platforms?.length || 0 },
                  { label: 'Avg 5x', value: summary?.avgFiveXScore || 0 },
                ].map(item => (
                <div key={item.label} style={{ padding: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4 }}>
                  <div style={{ fontSize: 9, color: '#666', letterSpacing: '0.12em', marginBottom: 6 }}>{item.label}</div>
                  <div style={{ fontSize: 20, color: '#3b82f6', fontWeight: 700 }}>{item.value}</div>
                </div>
              ))}
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 8 }}>PLATFORM SCOPE</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {ALL_PLATFORMS.map(platform => {
                  const active = selectedPlatforms.includes(platform);
                  return (
                    <button
                      key={platform}
                      onClick={() => togglePlatform(platform)}
                      style={{
                        padding: '6px 10px',
                        background: active ? 'rgba(59,130,246,0.16)' : 'rgba(255,255,255,0.04)',
                        border: active ? '1px solid rgba(59,130,246,0.35)' : '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 4,
                        color: active ? '#6ea8ff' : '#bbb',
                        fontSize: 11,
                        cursor: 'pointer',
                      }}
                    >
                      {labelPlatform(platform)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 8 }}>DISCOVERY PROVIDERS</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {DISCOVERY_PROVIDERS.map(provider => {
                  const active = selectedDiscoveryProviders.includes(provider.id);
                  return (
                    <button
                      key={provider.id}
                      onClick={() => toggleDiscoveryProvider(provider.id)}
                      style={{
                        padding: '6px 10px',
                        background: active ? 'rgba(16,185,129,0.16)' : 'rgba(255,255,255,0.04)',
                        border: active ? '1px solid rgba(16,185,129,0.35)' : '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 4,
                        color: active ? '#34d399' : '#bbb',
                        fontSize: 11,
                        cursor: 'pointer',
                      }}
                    >
                      {provider.label}
                    </button>
                  );
                })}
              </div>
              <div style={{ fontSize: 10, color: '#777', marginTop: 8 }}>
                Browser search keeps the current public search flow. Firecrawl broadens discovery when a Firecrawl API key is configured.
              </div>
            </div>

            <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 8 }}>ADD VIDEO BREAKDOWN</div>
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ padding: 10, background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.12)', borderRadius: 4 }}>
                <div style={{ fontSize: 10, color: '#6ea8ff', letterSpacing: '0.12em', marginBottom: 8 }}>BATCH COLLECTION</div>
                <div style={{ display: 'grid', gap: 8 }}>
                  <input style={inputStyle} placeholder="Niche search, e.g. wedding photography and videography" value={nicheSearch} onChange={e => setNicheSearch(e.target.value)} />
                  <button onClick={() => collectBatch('niche')} disabled={batchCollecting || !(nicheSearch.trim() || video.niche)} style={{
                    padding: '8px 12px', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.35)',
                    borderRadius: 4, color: '#34d399', cursor: batchCollecting ? 'wait' : 'pointer', fontSize: 11, fontWeight: 700,
                  }}>
                    {batchCollecting ? 'Collecting...' : 'Discover Live Viral Videos'}
                  </button>
                  <input style={inputStyle} placeholder="Creator profile URL for single-platform collection" value={creatorUrl} onChange={e => setCreatorUrl(e.target.value)} />
                  <button onClick={() => collectBatch('creator')} disabled={batchCollecting || !creatorUrl.trim()} style={{
                    padding: '8px 12px', background: 'rgba(59,130,246,0.14)', border: '1px solid rgba(59,130,246,0.35)',
                    borderRadius: 4, color: '#3b82f6', cursor: batchCollecting ? 'wait' : 'pointer', fontSize: 11, fontWeight: 700,
                  }}>
                    {batchCollecting ? 'Collecting...' : 'Collect Creator Videos'}
                  </button>
                  <textarea style={{ ...inputStyle, minHeight: 80 }} placeholder="Paste one video URL per line across TikTok, YouTube, LinkedIn, or Instagram" value={batchUrls} onChange={e => setBatchUrls(e.target.value)} />
                  <button onClick={() => collectBatch('urls')} disabled={batchCollecting || !batchUrls.trim()} style={{
                    padding: '8px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 4, color: '#ddd', cursor: batchCollecting ? 'wait' : 'pointer', fontSize: 11, fontWeight: 700,
                  }}>
                    {batchCollecting ? 'Collecting...' : 'Collect URL Batch'}
                  </button>
                  {batchStatus && <div style={{ fontSize: 11, color: '#9cc3ff' }}>{batchStatus}</div>}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
                <input style={inputStyle} placeholder="Paste social video URL to auto-fill" value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} />
                <button onClick={collectFromUrl} disabled={collecting || !sourceUrl.trim()} style={{
                  padding: '8px 12px', background: 'rgba(59,130,246,0.14)', border: '1px solid rgba(59,130,246,0.35)',
                  borderRadius: 4, color: '#3b82f6', cursor: collecting ? 'wait' : 'pointer', fontSize: 11, fontWeight: 700,
                }}>
                  {collecting ? 'Collecting...' : 'Auto-fill'}
                </button>
              </div>

              <input style={inputStyle} placeholder="Niche" value={video.niche} onChange={e => setVideo(prev => ({ ...prev, niche: e.target.value }))} />
              <select style={inputStyle} value={video.platform} onChange={e => setVideo(prev => ({ ...prev, platform: e.target.value }))}>
                {ALL_PLATFORMS.map(platform => <option key={platform} value={platform}>{labelPlatform(platform)}</option>)}
              </select>
              <input style={inputStyle} placeholder="Creator name" value={video.creatorName} onChange={e => setVideo(prev => ({ ...prev, creatorName: e.target.value }))} />
              <input style={inputStyle} placeholder="Creator handle" value={video.creatorHandle} onChange={e => setVideo(prev => ({ ...prev, creatorHandle: e.target.value }))} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <input style={inputStyle} placeholder="Followers" value={video.followerCount} onChange={e => setVideo(prev => ({ ...prev, followerCount: e.target.value }))} />
                <input style={inputStyle} placeholder="Views" value={video.viewCount} onChange={e => setVideo(prev => ({ ...prev, viewCount: e.target.value }))} />
              </div>
              <input style={inputStyle} placeholder="Video URL" value={video.url} onChange={e => setVideo(prev => ({ ...prev, url: e.target.value }))} />
              <input style={inputStyle} placeholder="Topic" value={video.topic} onChange={e => setVideo(prev => ({ ...prev, topic: e.target.value }))} />
              <input style={inputStyle} placeholder="Subject" value={video.subject} onChange={e => setVideo(prev => ({ ...prev, subject: e.target.value }))} />
              <input style={inputStyle} placeholder="Visual hook" value={video.visualHook} onChange={e => setVideo(prev => ({ ...prev, visualHook: e.target.value }))} />
              <input style={inputStyle} placeholder="Written hook" value={video.writtenHook} onChange={e => setVideo(prev => ({ ...prev, writtenHook: e.target.value }))} />
              <input style={inputStyle} placeholder="Verbal hook" value={video.verbalHook} onChange={e => setVideo(prev => ({ ...prev, verbalHook: e.target.value }))} />
              <textarea style={{ ...inputStyle, minHeight: 70 }} placeholder="Script structure" value={video.scriptStructure} onChange={e => setVideo(prev => ({ ...prev, scriptStructure: e.target.value }))} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <select style={inputStyle} value={video.format} onChange={e => setVideo(prev => ({ ...prev, format: e.target.value }))}>
                  <option value="talking-head">Talking head</option>
                  <option value="whiteboard">Whiteboard</option>
                  <option value="two-person">Two person</option>
                  <option value="audio-broll">Audio B-roll</option>
                  <option value="podcast-cut">Podcast cut</option>
                  <option value="screen-recording">Screen recording</option>
                  <option value="voiceover-demo">Voiceover demo</option>
                  <option value="other">Other</option>
                </select>
                <select style={inputStyle} value={video.editComplexity} onChange={e => setVideo(prev => ({ ...prev, editComplexity: e.target.value }))}>
                  <option value="basic">Basic edit</option>
                  <option value="medium">Medium edit</option>
                  <option value="advanced">Advanced edit</option>
                </select>
              </div>
              <textarea style={{ ...inputStyle, minHeight: 80 }} placeholder="Actionable value" value={video.actionableValue} onChange={e => setVideo(prev => ({ ...prev, actionableValue: e.target.value }))} />
              <input style={inputStyle} placeholder="CTA" value={video.cta} onChange={e => setVideo(prev => ({ ...prev, cta: e.target.value }))} />
              <input style={inputStyle} placeholder="Keywords (comma separated)" value={video.keywords} onChange={e => setVideo(prev => ({ ...prev, keywords: e.target.value }))} />
              <textarea style={{ ...inputStyle, minHeight: 70 }} placeholder="Notes" value={video.notes} onChange={e => setVideo(prev => ({ ...prev, notes: e.target.value }))} />
              <button onClick={saveVideo} disabled={saving || !video.niche || !video.creatorHandle || !video.viewCount} style={{
                padding: '10px 14px', background: 'rgba(59,130,246,0.14)', border: '1px solid rgba(59,130,246,0.35)',
                borderRadius: 4, color: '#3b82f6', cursor: saving ? 'wait' : 'pointer', fontSize: 11, fontWeight: 700,
              }}>
                {saving ? 'Saving...' : 'Save Breakdown'}
              </button>
            </div>
          </div>

          <div style={{ padding: 16, overflowY: 'auto' }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              <input
                style={{ ...inputStyle, maxWidth: 280 }}
                placeholder="Search topic, creator, hook..."
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
              <button onClick={() => loadAll(query)} style={{
                padding: '8px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 4, color: '#ddd', cursor: 'pointer', fontSize: 11,
              }}>Search</button>
              <button onClick={() => { const next = !freshOnly; setFreshOnly(next); loadAll(query, selectedPlatforms, next); }} style={{
                padding: '8px 12px', background: freshOnly ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.04)',
                border: freshOnly ? '1px solid rgba(16,185,129,0.35)' : '1px solid rgba(255,255,255,0.08)',
                borderRadius: 4, color: freshOnly ? '#34d399' : '#bbb', cursor: 'pointer', fontSize: 11,
              }}>{freshOnly ? 'Fresh Only: ON' : 'Fresh Only: OFF'}</button>
              <button onClick={() => setActivePlatformView('all')} style={{
                padding: '8px 12px', background: activePlatformView === 'all' ? 'rgba(59,130,246,0.14)' : 'rgba(255,255,255,0.04)',
                border: activePlatformView === 'all' ? '1px solid rgba(59,130,246,0.35)' : '1px solid rgba(255,255,255,0.08)',
                borderRadius: 4, color: activePlatformView === 'all' ? '#6ea8ff' : '#bbb', cursor: 'pointer', fontSize: 11,
              }}>All</button>
              {selectedPlatforms.map(platform => (
                <button key={platform} onClick={() => setActivePlatformView(platform)} style={{
                  padding: '8px 12px', background: activePlatformView === platform ? 'rgba(59,130,246,0.14)' : 'rgba(255,255,255,0.04)',
                  border: activePlatformView === platform ? '1px solid rgba(59,130,246,0.35)' : '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 4, color: activePlatformView === platform ? '#6ea8ff' : '#bbb', cursor: 'pointer', fontSize: 11,
                }}>{labelPlatform(platform)}</button>
              ))}
            </div>

            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 8 }}>PLATFORM DATASETS</div>
              <div style={{ display: 'grid', gap: 10 }}>
                {visiblePackets.map(item => (
                  <div key={item.platform} style={{ padding: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                      <div>
                        <div style={{ color: '#3b82f6', fontWeight: 700 }}>{labelPlatform(item.platform)} Research</div>
                        <div style={{ fontSize: 11, color: '#777' }}>
                          {item.platformSummary.totalVideos} videos · {item.platformSummary.qualifyingVideos} 5x winners · {item.platformSummary.breakoutNowVideos} breakout now · {item.platformSummary.totalCreators} creators
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', fontSize: 11, color: '#bbb' }}>
                        <div>{item.platformSummary.avgFiveXScore}x avg</div>
                        <div>freshness {item.platformSummary.avgFreshnessScore}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: '#cfcfe5', marginBottom: 10 }}>{summaryText(item)}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12 }}>
                      <div>
                        <div style={{ color: '#888', marginBottom: 6 }}>Top creators</div>
                        {(item.platformTopCreators || []).slice(0, 4).map(creator => (
                          <div key={`${item.platform}-${creator.creatorHandle}`} style={{ marginBottom: 4, color: '#ddd' }}>
                            @{creator.creatorHandle} · {creator.qualifyingVideos} winners · {creator.avgFiveXScore}x
                          </div>
                        ))}
                      </div>
                      <div>
                        <div style={{ color: '#888', marginBottom: 6 }}>Winning topics</div>
                        {(item.platformWinningTopics || []).slice(0, 4).map(topic => (
                          <div key={`${item.platform}-${topic.topic}`} style={{ marginBottom: 4, color: '#ddd' }}>
                            {topic.topic} ({topic.count})
                          </div>
                        ))}
                      </div>
                      <div>
                        <div style={{ color: '#888', marginBottom: 6 }}>Winning formats</div>
                        {(item.platformWinningFormats || []).slice(0, 4).map(format => (
                          <div key={`${item.platform}-${format.format}`} style={{ marginBottom: 4, color: '#ddd' }}>
                            {format.format} ({format.count})
                          </div>
                        ))}
                      </div>
                      <div>
                        <div style={{ color: '#888', marginBottom: 6 }}>Hook families</div>
                        {(item.platformHookFamilies || []).slice(0, 4).map(hook => (
                          <div key={`${item.platform}-${hook.phrase}`} style={{ marginBottom: 4, color: '#ddd' }}>
                            {hook.phrase}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 8 }}>GLOBAL THEMES</div>
              <div style={{ padding: 14, background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.12)', borderRadius: 4 }}>
                <div style={{ marginBottom: 10, fontSize: 12, color: '#d7e4ff' }}>
                  Derived from the platform-native packets. Use this to spot global momentum without flattening platform differences.
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 12 }}>
                  <div>
                    <div style={{ color: '#888', marginBottom: 6 }}>Global trend candidates</div>
                    {(packet?.crossPlatformSynthesis?.globalTrendCandidates || []).slice(0, 6).map(item => (
                      <div key={item.trend} style={{ marginBottom: 6, color: '#ddd' }}>
                        {item.trend} · {item.overlapStrength} · {item.platforms.join(', ')}
                      </div>
                    ))}
                  </div>
                  <div>
                    <div style={{ color: '#888', marginBottom: 6 }}>Cross-platform hook families</div>
                    {(packet?.crossPlatformSynthesis?.crossPlatformHookFamilies || []).slice(0, 6).map(item => (
                      <div key={item.phrase} style={{ marginBottom: 6, color: '#ddd' }}>
                        {item.phrase} · {item.platforms.join(', ')}
                      </div>
                    ))}
                  </div>
                  <div>
                    <div style={{ color: '#888', marginBottom: 6 }}>Topic clusters</div>
                    {(packet?.crossPlatformSynthesis?.crossPlatformTopicClusters || []).slice(0, 6).map(item => (
                      <div key={item.topic} style={{ marginBottom: 6, color: '#ddd' }}>
                        {item.topic} · {item.platforms.join(', ')}
                      </div>
                    ))}
                  </div>
                  <div>
                    <div style={{ color: '#888', marginBottom: 6 }}>CTA themes</div>
                    {(packet?.crossPlatformSynthesis?.crossPlatformCTAThemes || []).slice(0, 6).map(item => (
                      <div key={item.cta} style={{ marginBottom: 6, color: '#ddd' }}>
                        {item.cta || 'Unspecified CTA'} · {item.platforms.join(', ')}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div>
              <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 8 }}>VIDEO BREAKDOWNS</div>
              <div style={{ display: 'grid', gap: 10 }}>
                {visibleVideos.slice(0, 24).map(item => (
                  <div key={item.id} style={{ padding: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                      <div>
                        <div style={{ color: '#fff', fontWeight: 700 }}>{item.topic || item.subject || 'Untitled'}</div>
                        <div style={{ fontSize: 11, color: '#777' }}>@{item.creatorHandle} · {labelPlatform(item.platform)} · {item.format}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ color: item.qualifiesFiveX ? '#10b981' : '#f59e0b', fontWeight: 700 }}>
                          {item.insufficientFollowerData ? 'No follower data' : `${item.fiveXScore}x`}
                        </div>
                        <div style={{ fontSize: 11, color: '#777' }}>{item.viewCount} views · freshness {item.freshnessScore}</div>
                        <div style={{ fontSize: 11, color: '#777' }}>{item.publishedAtText || 'date unknown'}</div>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gap: 6, fontSize: 12, color: '#ccc' }}>
                      <div><strong>Visual:</strong> {item.visualHook || '-'}</div>
                      <div><strong>Written:</strong> {item.writtenHook || '-'}</div>
                      <div><strong>Verbal:</strong> {item.verbalHook || '-'}</div>
                      <div><strong>Structure:</strong> {item.scriptStructure || '-'}</div>
                      <div><strong>Value:</strong> {item.actionableValue || '-'}</div>
                      <div><strong>Edit:</strong> {item.editComplexity}</div>
                    </div>
                  </div>
                ))}
                {visibleVideos.length === 0 && (
                  <div style={{ padding: 20, color: '#666', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 4 }}>
                    No video breakdowns yet for this view.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
