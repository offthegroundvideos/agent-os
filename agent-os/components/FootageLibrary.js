'use client';
import { useState, useEffect } from 'react';

const CATEGORIES = [
  { id: 'wedding', label: 'Wedding', icon: '💍' },
  { id: 'music-video', label: 'Music Video', icon: '🎵' },
  { id: 'corporate', label: 'Corporate', icon: '🏢' },
  { id: 'parade', label: 'Parade', icon: '🎭' },
  { id: 'cultural-event', label: 'Cultural Event', icon: '🎪' },
  { id: 'event-highlight', label: 'Event Highlight', icon: '✨' },
  { id: 'boating-yacht', label: 'Boating & Yacht', icon: '⛵' },
  { id: 'travel-destination', label: 'Travel', icon: '✈️' },
  { id: 'tourism', label: 'Tourism', icon: '🗺️' },
  { id: 'drone-aerial', label: 'Drone / Aerial', icon: '🚁' },
  { id: 'documentary', label: 'Documentary', icon: '🎬' },
  { id: 'boudoir', label: 'Boudoir', icon: '📸' },
  { id: 'real-estate', label: 'Real Estate', icon: '🏠' },
  { id: 'stock-footage', label: 'Stock Footage', icon: '🎞️' },
  { id: 'nature', label: 'Nature', icon: '🌿' },
];

const STATUS_COLORS = {
  raw: '#f59e0b',
  edited: '#3b82f6',
  delivered: '#10b981',
  archived: '#555',
};

export default function FootageLibrary({ onClose }) {
  const [view, setView] = useState('library');
  const [clips, setClips] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [stockOnly, setStockOnly] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedClip, setSelectedClip] = useState(null);
  const [saving, setSaving] = useState(false);

  const [newClip, setNewClip] = useState({
    title: '', description: '', filename: '',
    duration: '', resolution: '4K', fps: '60',
    categories: [], tags: '', location: '',
    shootDate: '', client: '', project: '',
    isStock: false, stockPrice: 49,
    exclusivePrice: 299, notes: '', status: 'raw',
    addedBy: 'Jack',
  });

  useEffect(() => {
    loadLibrary();
    loadMeta();
  }, []);

  useEffect(() => {
    loadLibrary();
  }, [search, filterCategory, filterLocation, stockOnly]);

  const loadLibrary = async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('query', search);
      if (filterCategory) params.set('category', filterCategory);
      if (filterLocation) params.set('location', filterLocation);
      if (stockOnly) params.set('stockOnly', 'true');

      const res = await fetch('/api/footage?' + params.toString());
      const data = await res.json();
      setClips(data.clips || []);
    } catch {}
    finally { setLoading(false); }
  };

  const loadMeta = async () => {
    try {
      const res = await fetch('/api/footage?action=meta');
      const data = await res.json();
      setMeta(data);
    } catch {}
  };

  const addClip = async () => {
    setSaving(true);
    try {
      const clipData = {
        ...newClip,
        tags: newClip.tags.split(',').map(t => t.trim()).filter(Boolean),
      };
      await fetch('/api/footage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'addClip', ...clipData }),
      });
      setShowAddForm(false);
      setNewClip({
        title: '', description: '', filename: '',
        duration: '', resolution: '4K', fps: '60',
        categories: [], tags: '', location: '',
        shootDate: '', client: '', project: '',
        isStock: false, stockPrice: 49,
        exclusivePrice: 299, notes: '', status: 'raw',
        addedBy: 'Jack',
      });
      loadLibrary();
      loadMeta();
    } catch {}
    finally { setSaving(false); }
  };

  const toggleCategory = (cat) => {
    setNewClip(prev => ({
      ...prev,
      categories: prev.categories.includes(cat)
        ? prev.categories.filter(c => c !== cat)
        : [...prev.categories, cat],
    }));
  };

  const inputStyle = {
    width: '100%', background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 3, color: '#e2e2e8', padding: '8px 12px',
    fontSize: 12, fontFamily: 'JetBrains Mono',
    outline: 'none', marginBottom: 8,
  };

  const labelStyle = {
    fontSize: 9, color: '#666', letterSpacing: '0.15em',
    textTransform: 'uppercase', display: 'block', marginBottom: 4,
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 24,
    }}>
      <div style={{
        background: '#0d0d14',
        border: '1px solid rgba(249,115,22,0.3)',
        borderRadius: 4, width: '100%', maxWidth: 1100,
        maxHeight: '92vh', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 0 60px rgba(249,115,22,0.08)',
      }}>

        {/* Header */}
        <div style={{
          padding: '14px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div>
              <div style={{
                fontFamily: 'Orbitron, sans-serif', fontSize: 13,
                fontWeight: 700, color: '#f97316', letterSpacing: '0.1em',
              }}>🎬 FOOTAGE LIBRARY</div>
              <div style={{ fontSize: 10, color: '#444', marginTop: 2 }}>
                {meta?.totalClips || 0} clips · {meta?.stockClips || 0} stock · {meta?.totalCollections || 0} collections
              </div>
            </div>
            {meta?.categoryBreakdown?.slice(0, 4).map(c => (
              <div key={c.category} style={{
                padding: '3px 10px',
                background: 'rgba(249,115,22,0.1)',
                border: '1px solid rgba(249,115,22,0.2)',
                borderRadius: 100, fontSize: 9,
                color: '#f97316',
              }}>
                {c.category}: {c.count}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              style={{
                padding: '6px 14px',
                background: 'rgba(249,115,22,0.15)',
                border: '1px solid rgba(249,115,22,0.4)',
                borderRadius: 3, color: '#f97316',
                fontFamily: 'Orbitron, sans-serif',
                fontSize: 9, letterSpacing: '0.1em', cursor: 'pointer',
              }}>+ ADD CLIP</button>
            <button onClick={onClose} style={{
              background: 'transparent', border: '1px solid #333',
              color: '#888', padding: '4px 12px', borderRadius: 2,
              cursor: 'pointer', fontSize: 11, fontFamily: 'JetBrains Mono',
            }}>✕</button>
          </div>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* Left sidebar — filters */}
          <div style={{
            width: 200, borderRight: '1px solid rgba(255,255,255,0.06)',
            padding: 14, overflowY: 'auto',
            background: 'rgba(0,0,0,0.2)',
          }}>
            <div style={{ fontSize: 9, color: '#444', letterSpacing: '0.2em', marginBottom: 10 }}>
              SEARCH
            </div>
            <input
              style={{ ...inputStyle, marginBottom: 16 }}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search clips..."
            />

            <div style={{ fontSize: 9, color: '#444', letterSpacing: '0.2em', marginBottom: 10 }}>
              FILTER BY TYPE
            </div>
            <div
              onClick={() => setFilterCategory('')}
              style={{
                padding: '6px 10px', marginBottom: 4,
                borderRadius: 3, cursor: 'pointer', fontSize: 11,
                background: !filterCategory ? 'rgba(249,115,22,0.15)' : 'transparent',
                color: !filterCategory ? '#f97316' : '#555',
                border: '1px solid ' + (!filterCategory ? 'rgba(249,115,22,0.3)' : 'transparent'),
              }}
            >All Clips ({meta?.totalClips || 0})</div>

            {CATEGORIES.map(cat => {
              const count = meta?.categoryBreakdown?.find(c => c.category === cat.id)?.count || 0;
              if (count === 0) return null;
              return (
                <div
                  key={cat.id}
                  onClick={() => setFilterCategory(filterCategory === cat.id ? '' : cat.id)}
                  style={{
                    padding: '6px 10px', marginBottom: 3,
                    borderRadius: 3, cursor: 'pointer',
                    fontSize: 11,
                    background: filterCategory === cat.id ? 'rgba(249,115,22,0.15)' : 'transparent',
                    color: filterCategory === cat.id ? '#f97316' : '#666',
                    border: '1px solid ' + (filterCategory === cat.id ? 'rgba(249,115,22,0.3)' : 'transparent'),
                  }}
                >
                  {cat.icon} {cat.label} ({count})
                </div>
              );
            })}

            <div style={{
              marginTop: 16, paddingTop: 12,
              borderTop: '1px solid rgba(255,255,255,0.04)',
            }}>
              <div
                onClick={() => setStockOnly(!stockOnly)}
                style={{
                  padding: '8px 10px', borderRadius: 3,
                  cursor: 'pointer', fontSize: 11,
                  background: stockOnly ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.02)',
                  color: stockOnly ? '#10b981' : '#555',
                  border: '1px solid ' + (stockOnly ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.06)'),
                }}
              >
                🎞️ Stock Footage Only
                {meta?.stockClips > 0 && (
                  <span style={{ marginLeft: 6, fontSize: 9, color: '#10b981' }}>
                    ({meta.stockClips})
                  </span>
                )}
              </div>
            </div>

            <div style={{
              marginTop: 12, padding: 12,
              background: 'rgba(249,115,22,0.04)',
              border: '1px solid rgba(249,115,22,0.1)',
              borderRadius: 3, fontSize: 9, color: '#555', lineHeight: 1.8,
            }}>
              <div style={{ color: '#f97316', marginBottom: 4, fontFamily: 'Orbitron, sans-serif' }}>
                STORAGE
              </div>
              <div>Raw: C:\AI-Agents\footage-library\raw\</div>
              <div>Edited: C:\AI-Agents\footage-library\edited\</div>
              <div>Stock: C:\AI-Agents\footage-library\stock\</div>
            </div>
          </div>

          {/* Main content */}
          <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>

            {/* Add clip form */}
            {showAddForm && (
              <div style={{
                marginBottom: 20, padding: 20,
                background: 'rgba(249,115,22,0.04)',
                border: '1px solid rgba(249,115,22,0.2)',
                borderRadius: 6,
              }}>
                <div style={{
                  fontFamily: 'Orbitron, sans-serif', fontSize: 11,
                  color: '#f97316', marginBottom: 16, letterSpacing: '0.1em',
                }}>ADD NEW CLIP TO LIBRARY</div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Title *</label>
                    <input style={inputStyle} value={newClip.title}
                      onChange={e => setNewClip(p => ({ ...p, title: e.target.value }))}
                      placeholder="Bora Bora Drone Sunrise" />
                  </div>
                  <div>
                    <label style={labelStyle}>Filename</label>
                    <input style={inputStyle} value={newClip.filename}
                      onChange={e => setNewClip(p => ({ ...p, filename: e.target.value }))}
                      placeholder="BoraBora_Drone_001.mp4" />
                  </div>
                  <div>
                    <label style={labelStyle}>Location</label>
                    <input style={inputStyle} value={newClip.location}
                      onChange={e => setNewClip(p => ({ ...p, location: e.target.value }))}
                      placeholder="Bora Bora, French Polynesia" />
                  </div>
                  <div>
                    <label style={labelStyle}>Shoot Date</label>
                    <input style={inputStyle} type="date" value={newClip.shootDate}
                      onChange={e => setNewClip(p => ({ ...p, shootDate: e.target.value }))} />
                  </div>
                  <div>
                    <label style={labelStyle}>Duration</label>
                    <input style={inputStyle} value={newClip.duration}
                      onChange={e => setNewClip(p => ({ ...p, duration: e.target.value }))}
                      placeholder="0:32" />
                  </div>
                  <div>
                    <label style={labelStyle}>Resolution</label>
                    <select style={{ ...inputStyle, cursor: 'pointer' }} value={newClip.resolution}
                      onChange={e => setNewClip(p => ({ ...p, resolution: e.target.value }))}>
                      <option>4K</option>
                      <option>6K</option>
                      <option>8K</option>
                      <option>1080p</option>
                      <option>720p</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>FPS</label>
                    <select style={{ ...inputStyle, cursor: 'pointer' }} value={newClip.fps}
                      onChange={e => setNewClip(p => ({ ...p, fps: e.target.value }))}>
                      <option>24</option>
                      <option>30</option>
                      <option>60</option>
                      <option>120</option>
                      <option>240</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Status</label>
                    <select style={{ ...inputStyle, cursor: 'pointer' }} value={newClip.status}
                      onChange={e => setNewClip(p => ({ ...p, status: e.target.value }))}>
                      <option value="raw">Raw</option>
                      <option value="edited">Edited</option>
                      <option value="delivered">Delivered</option>
                      <option value="archived">Archived</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Client (if project footage)</label>
                    <input style={inputStyle} value={newClip.client}
                      onChange={e => setNewClip(p => ({ ...p, client: e.target.value }))}
                      placeholder="Smith Wedding / Tourism Board" />
                  </div>
                  <div>
                    <label style={labelStyle}>Project</label>
                    <input style={inputStyle} value={newClip.project}
                      onChange={e => setNewClip(p => ({ ...p, project: e.target.value }))}
                      placeholder="Bora Bora Tourism Campaign 2026" />
                  </div>
                </div>

                <label style={labelStyle}>Description</label>
                <textarea style={{ ...inputStyle, height: 60, resize: 'vertical' }}
                  value={newClip.description}
                  onChange={e => setNewClip(p => ({ ...p, description: e.target.value }))}
                  placeholder="Aerial drone shot of Bora Bora lagoon at sunrise, crystal clear turquoise water, overwater bungalows visible..." />

                <label style={labelStyle}>Tags (comma separated)</label>
                <input style={inputStyle} value={newClip.tags}
                  onChange={e => setNewClip(p => ({ ...p, tags: e.target.value }))}
                  placeholder="drone, aerial, ocean, turquoise, sunrise, tropical, paradise" />

                <label style={labelStyle}>Categories (select all that apply)</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                  {CATEGORIES.map(cat => (
                    <div
                      key={cat.id}
                      onClick={() => toggleCategory(cat.id)}
                      style={{
                        padding: '4px 10px', borderRadius: 100,
                        cursor: 'pointer', fontSize: 10,
                        background: newClip.categories.includes(cat.id)
                          ? 'rgba(249,115,22,0.2)'
                          : 'rgba(255,255,255,0.04)',
                        border: '1px solid ' + (newClip.categories.includes(cat.id)
                          ? 'rgba(249,115,22,0.5)'
                          : 'rgba(255,255,255,0.08)'),
                        color: newClip.categories.includes(cat.id) ? '#f97316' : '#666',
                      }}
                    >{cat.icon} {cat.label}</div>
                  ))}
                </div>

                <div style={{
                  padding: 12, marginBottom: 12,
                  background: newClip.isStock ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.02)',
                  border: '1px solid ' + (newClip.isStock ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.06)'),
                  borderRadius: 4,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: newClip.isStock ? 12 : 0 }}>
                    <div
                      onClick={() => setNewClip(p => ({ ...p, isStock: !p.isStock }))}
                      style={{
                        width: 36, height: 20, borderRadius: 100,
                        background: newClip.isStock ? '#10b981' : '#333',
                        position: 'relative', cursor: 'pointer',
                        transition: 'background 0.2s',
                      }}
                    >
                      <div style={{
                        position: 'absolute',
                        top: 2, left: newClip.isStock ? 18 : 2,
                        width: 16, height: 16, borderRadius: '50%',
                        background: '#fff', transition: 'left 0.2s',
                      }} />
                    </div>
                    <span style={{ fontSize: 11, color: newClip.isStock ? '#10b981' : '#555' }}>
                      Mark as Stock Footage for licensing
                    </span>
                  </div>

                  {newClip.isStock && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <label style={labelStyle}>Standard License Price ($)</label>
                        <input style={inputStyle} type="number" value={newClip.stockPrice}
                          onChange={e => setNewClip(p => ({ ...p, stockPrice: parseInt(e.target.value) }))}
                          placeholder="49" />
                      </div>
                      <div>
                        <label style={labelStyle}>Exclusive License Price ($)</label>
                        <input style={inputStyle} type="number" value={newClip.exclusivePrice}
                          onChange={e => setNewClip(p => ({ ...p, exclusivePrice: parseInt(e.target.value) }))}
                          placeholder="299" />
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={addClip} disabled={saving || !newClip.title} style={{
                    flex: 1, padding: '10px 0',
                    background: saving ? 'rgba(249,115,22,0.08)' : 'rgba(249,115,22,0.18)',
                    border: '1px solid rgba(249,115,22,0.4)',
                    borderRadius: 3, color: '#f97316',
                    fontFamily: 'Orbitron, sans-serif',
                    fontSize: 10, letterSpacing: '0.1em',
                    cursor: saving ? 'not-allowed' : 'pointer',
                  }}>{saving ? '⟳ Saving...' : '+ ADD TO LIBRARY'}</button>
                  <button onClick={() => setShowAddForm(false)} style={{
                    padding: '10px 16px', background: 'transparent',
                    border: '1px solid #333', borderRadius: 3,
                    color: '#555', cursor: 'pointer',
                    fontSize: 11, fontFamily: 'JetBrains Mono',
                  }}>Cancel</button>
                </div>
              </div>
            )}

            {/* Clips grid */}
            {loading ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#444', fontSize: 12 }}>
                Loading library...
              </div>
            ) : clips.length === 0 ? (
              <div style={{
                textAlign: 'center', padding: 60,
                color: '#333', fontSize: 12, lineHeight: 1.8,
              }}>
                {search || filterCategory ? (
                  <div>
                    No clips match your search.<br />
                    <span style={{ color: '#f97316', cursor: 'pointer' }}
                      onClick={() => { setSearch(''); setFilterCategory(''); }}>
                      Clear filters
                    </span>
                  </div>
                ) : (
                  <div>
                    Your footage library is empty.<br />
                    Click <span style={{ color: '#f97316' }}>+ ADD CLIP</span> to start building your library.<br /><br />
                    <span style={{ fontSize: 10, color: '#444' }}>
                      Tip: Start by adding your best drone shots and travel footage as stock clips.
                      Each clip can be marked for stock licensing with custom pricing.
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', marginBottom: 14,
                }}>
                  <div style={{ fontSize: 10, color: '#555' }}>
                    {clips.length} clip{clips.length !== 1 ? 's' : ''} found
                  </div>
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: 12,
                }}>
                  {clips.map(clip => (
                    <div
                      key={clip.id}
                      onClick={() => setSelectedClip(selectedClip?.id === clip.id ? null : clip)}
                      style={{
                        background: selectedClip?.id === clip.id
                          ? 'rgba(249,115,22,0.08)'
                          : 'rgba(255,255,255,0.02)',
                        border: '1px solid ' + (selectedClip?.id === clip.id
                          ? 'rgba(249,115,22,0.4)'
                          : 'rgba(255,255,255,0.06)'),
                        borderRadius: 6, padding: 14,
                        cursor: 'pointer', transition: 'all 0.2s',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <div style={{
                          fontFamily: 'Orbitron, sans-serif', fontSize: 11,
                          fontWeight: 700, color: '#e2e2e8',
                        }}>{clip.title}</div>
                        <div style={{
                          width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 3,
                          background: STATUS_COLORS[clip.status] || '#555',
                        }} />
                      </div>

                      {clip.location && (
                        <div style={{ fontSize: 10, color: '#f97316', marginBottom: 4 }}>
                          📍 {clip.location}
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                        {clip.resolution && (
                          <span style={{
                            fontSize: 9, padding: '2px 6px',
                            background: 'rgba(59,130,246,0.15)',
                            border: '1px solid rgba(59,130,246,0.3)',
                            borderRadius: 3, color: '#3b82f6',
                          }}>{clip.resolution}</span>
                        )}
                        {clip.fps && (
                          <span style={{
                            fontSize: 9, padding: '2px 6px',
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: 3, color: '#888',
                          }}>{clip.fps}fps</span>
                        )}
                        {clip.duration && (
                          <span style={{
                            fontSize: 9, padding: '2px 6px',
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: 3, color: '#888',
                          }}>⏱ {clip.duration}</span>
                        )}
                        {clip.isStock && (
                          <span style={{
                            fontSize: 9, padding: '2px 6px',
                            background: 'rgba(16,185,129,0.15)',
                            border: '1px solid rgba(16,185,129,0.3)',
                            borderRadius: 3, color: '#10b981',
                          }}>💰 Stock ${clip.stockPrice}</span>
                        )}
                      </div>

                      {clip.categories?.length > 0 && (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                          {clip.categories.slice(0, 3).map(cat => {
                            const catData = CATEGORIES.find(c => c.id === cat);
                            return catData ? (
                              <span key={cat} style={{
                                fontSize: 9, padding: '2px 6px',
                                background: 'rgba(249,115,22,0.1)',
                                border: '1px solid rgba(249,115,22,0.2)',
                                borderRadius: 100, color: '#f97316',
                              }}>{catData.icon} {catData.label}</span>
                            ) : null;
                          })}
                        </div>
                      )}

                      {clip.description && (
                        <div style={{
                          fontSize: 10, color: '#555', lineHeight: 1.5,
                          overflow: 'hidden',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                        }}>
                          {clip.description}
                        </div>
                      )}

                      {selectedClip?.id === clip.id && (
                        <div style={{
                          marginTop: 10, paddingTop: 10,
                          borderTop: '1px solid rgba(255,255,255,0.06)',
                        }}>
                          {clip.filename && (
                            <div style={{ fontSize: 9, color: '#444', marginBottom: 4 }}>
                              File: {clip.filename}
                            </div>
                          )}
                          {clip.client && (
                            <div style={{ fontSize: 9, color: '#444', marginBottom: 4 }}>
                              Client: {clip.client}
                            </div>
                          )}
                          {clip.project && (
                            <div style={{ fontSize: 9, color: '#444', marginBottom: 4 }}>
                              Project: {clip.project}
                            </div>
                          )}
                          {clip.shootDate && (
                            <div style={{ fontSize: 9, color: '#444', marginBottom: 4 }}>
                              Shot: {new Date(clip.shootDate).toLocaleDateString()}
                            </div>
                          )}
                          {clip.tags?.length > 0 && (
                            <div style={{ fontSize: 9, color: '#444' }}>
                              Tags: {clip.tags.join(', ')}
                            </div>
                          )}
                          {clip.isStock && (
                            <div style={{
                              marginTop: 8, padding: '6px 10px',
                              background: 'rgba(16,185,129,0.08)',
                              border: '1px solid rgba(16,185,129,0.2)',
                              borderRadius: 3,
                            }}>
                              <div style={{ fontSize: 10, color: '#10b981', fontWeight: 700, marginBottom: 2 }}>
                                Stock Footage
                              </div>
                              <div style={{ fontSize: 9, color: '#555' }}>
                                Standard: ${clip.stockPrice} · Exclusive: ${clip.exclusivePrice}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}