'use client';
import { useEffect, useMemo, useState } from 'react';

const COLORS = ['#f59e0b', '#3b82f6', '#ec4899', '#10b981', '#8b5cf6', '#ef4444', '#06b6d4'];

function shortenId(value) {
  if (!value) return 'Not set';
  const text = String(value);
  if (text.length <= 16) return text;
  return `${text.slice(0, 8)}...${text.slice(-4)}`;
}

function formatLabel(value, fallback) {
  if (!value) return fallback;
  return String(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

function normalizeClientForUi(client = {}) {
  return {
    ...client,
    locationId: client.ghl_location_id || client.locationId || '',
    niche: client.niche || '',
    color: client.color || '#f59e0b',
    email: client.email || '',
    phone: client.phone || '',
    notes: client.notes || '',
  };
}

export default function GHLPanel({ onClose, initialTab = 'clients', initialAssetId = '' }) {
  const [tab, setTab] = useState('clients');
  const [viewportWidth, setViewportWidth] = useState(1280);
  const [clients, setClients] = useState([]);
  const [activeClientId, setActiveClientId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [pipelines, setPipelines] = useState([]);
  const [pageContext, setPageContext] = useState(null);
  const [ghlPageBrief, setGhlPageBrief] = useState(null);
  const [readinessStatus, setReadinessStatus] = useState(null);
  const [showAddClient, setShowAddClient] = useState(false);
  const [clientProvisionMode, setClientProvisionMode] = useState('attach');
  const [agencyStatus, setAgencyStatus] = useState(null);

  const [agencyForm, setAgencyForm] = useState({
    agencyName: '',
    agencyApiKey: '',
    companyId: '',
  });

  const [newClient, setNewClient] = useState({
    name: '',
    niche: '',
    locationId: '',
    apiKey: '',
    email: '',
    phone: '',
    notes: '',
    color: '#f59e0b',
    website: '',
    address: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'US',
    timezone: 'America/Los_Angeles',
  });

  const [contactForm, setContactForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    niche: '',
    contentPlan: '',
  });

  useEffect(() => {
    setTab(initialTab || 'clients');
    loadClients();
    loadAgencyStatus();
    loadPageContext(initialAssetId);
  }, [initialTab, initialAssetId]);

  useEffect(() => {
    const updateViewport = () => setViewportWidth(window.innerWidth);
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  useEffect(() => {
    if (!activeClientId) return;
    loadReadinessStatus(activeClientId, pageContext?.assetId || initialAssetId);
  }, [activeClientId, pageContext?.assetId, initialAssetId]);

  const loadPageContext = async (assetId = '') => {
    try {
      const query = assetId ? `?assetId=${encodeURIComponent(assetId)}` : '';
      const res = await fetch(`/api/page-context${query}`);
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'No page context available');
      setPageContext(data.pageContext || null);
      setGhlPageBrief(data.ghlPageBrief || null);
      if (activeClientId) {
        await loadReadinessStatus(activeClientId, data.pageContext?.assetId || assetId);
      }
    } catch (err) {
      setPageContext(null);
      setGhlPageBrief(null);
    }
  };

  const loadAgencyStatus = async () => {
    try {
      const res = await fetch('/api/ghl?action=agencyStatus');
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to load agency status');
      setAgencyStatus(data.agency || null);
      setAgencyForm(prev => ({
        agencyName: data.agency?.agencyName || prev.agencyName || '',
        agencyApiKey: prev.agencyApiKey || '',
        companyId: data.agency?.companyId || prev.companyId || '',
      }));
    } catch (err) {
      setAgencyStatus(null);
    }
  };

  const loadReadinessStatus = async (clientId, assetId = '') => {
    if (!clientId) {
      setReadinessStatus(null);
      return;
    }
    try {
      const query = new URLSearchParams({ action: 'onboardingStatus', clientId });
      if (assetId) query.set('assetId', assetId);
      const res = await fetch(`/api/ghl?${query.toString()}`);
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to load onboarding status');
      setReadinessStatus(data);
    } catch (err) {
      setReadinessStatus(null);
    }
  };

  const activeClient = useMemo(
    () => clients.find(client => client.id === activeClientId) || null,
    [clients, activeClientId]
  );
  const isMobile = viewportWidth <= 900;

  const setTabView = nextTab => {
    setTab(nextTab);
    setError('');
    setResult(null);
  };

  const loadClients = async () => {
    try {
      const res = await fetch('/api/clients?action=active');
      if (!res.ok) throw new Error('Failed to load GHL clients');
      const data = await res.json();
      const nextClients = Array.isArray(data.clients) ? data.clients.map(normalizeClientForUi) : [];
      const nextActiveId = data.active?.id || nextClients[0]?.id || null;
      setClients(nextClients);
      setActiveClientId(nextActiveId);
      setError('');
      if (nextActiveId) {
        await loadPipelines(nextActiveId);
        await loadReadinessStatus(nextActiveId, initialAssetId);
      } else {
        setPipelines([]);
        setReadinessStatus(null);
      }
    } catch (err) {
      setError(err.message);
      setClients([]);
      setActiveClientId(null);
      setPipelines([]);
      setReadinessStatus(null);
    }
  };

  const loadPipelines = async clientId => {
    try {
      const res = await fetch(`/api/ghl?action=pipelines&clientId=${encodeURIComponent(clientId)}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to load GHL pipelines');
      }
      const data = await res.json();
      setPipelines(Array.isArray(data.pipelines) ? data.pipelines : []);
      setError('');
    } catch (err) {
      setError(err.message);
      setPipelines([]);
    }
  };

  const resetNewClient = () => {
    setNewClient({
      name: '',
      niche: '',
      locationId: '',
      apiKey: '',
      email: '',
      phone: '',
      notes: '',
      color: '#f59e0b',
      website: '',
      address: '',
      city: '',
      state: '',
      postalCode: '',
      country: 'US',
      timezone: 'America/Los_Angeles',
    });
  };

  const addClient = async () => {
    if (!newClient.name.trim()) {
      setError('Client name is required');
      return;
    }

    if (clientProvisionMode === 'attach' && !newClient.locationId.trim()) {
      setError('Client name and GHL location ID are required');
      return;
    }

    if (clientProvisionMode === 'provision' && !agencyStatus?.hasCompanyId) {
      setError('Add the agency API key and company ID in the Agency tab before provisioning sub-accounts');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        name: newClient.name.trim(),
        niche: newClient.niche.trim(),
        locationId: newClient.locationId.trim(),
        apiKey: newClient.apiKey.trim(),
        email: newClient.email.trim(),
        phone: newClient.phone.trim(),
        notes: newClient.notes.trim(),
        color: newClient.color,
        website: newClient.website.trim(),
        address: newClient.address.trim(),
        city: newClient.city.trim(),
        state: newClient.state.trim(),
        postalCode: newClient.postalCode.trim(),
        country: newClient.country.trim(),
        timezone: newClient.timezone.trim(),
      };

      const res = await fetch(clientProvisionMode === 'provision' ? '/api/ghl' : '/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          clientProvisionMode === 'provision'
            ? { action: 'provisionSubAccount', data: payload }
            : { action: 'add', client: payload }
        ),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `Failed to ${clientProvisionMode === 'provision' ? 'provision' : 'add'} client`);

      setShowAddClient(false);
      resetNewClient();
      setResult({
        title: clientProvisionMode === 'provision' ? 'Sub-account provisioned' : 'Client connected',
        lines: [
          `${data.client?.name || payload.name} is now available as a GHL sub-account.`,
          `Location ${shortenId(data.client?.ghl_location_id || data.client?.locationId || data.locationId || payload.locationId)}`,
        ],
      });
      await loadClients();
      await loadAgencyStatus();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const saveAgencySettings = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/ghl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'saveAgencyConfig', data: agencyForm }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to save agency settings');
      setAgencyStatus(data.agency || null);
      setResult({
        title: 'Agency connection saved',
        lines: [
          `${agencyForm.agencyName || 'Agency'} is now configured as the provisioning layer.`,
          agencyForm.companyId ? `Company ${shortenId(agencyForm.companyId)}` : 'Company ID still needs to be added for provisioning.',
        ],
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const validateAgency = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/ghl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'validateAgency', data: agencyForm }),
      });
      const data = await res.json();
      if (!res.ok || data.error || data.success === false) throw new Error(data.error || 'Agency validation failed');
      await loadAgencyStatus();
      setResult({
        title: 'Agency connection looks valid',
        lines: [
          `${agencyForm.agencyName || agencyStatus?.agencyName || 'Agency'} can be used as the provisioning layer.`,
          data.payload?.hasCompanyId ? 'Company ID present.' : 'Token saved, but company ID is still missing.',
        ],
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const switchClient = async clientId => {
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'setActive', clientId }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to switch client');
      setActiveClientId(clientId);
      setResult(null);
      setError('');
      await loadPipelines(clientId);
      await loadReadinessStatus(clientId, pageContext?.assetId || initialAssetId);
    } catch (err) {
      setError(err.message);
    }
  };

  const attachLatestResearchPacket = async () => {
    if (!activeClientId) {
      setError('Select an active client first');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/ghl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'attachResearchPacket',
          clientId: activeClientId,
          data: {
            assetId: pageContext?.assetId || '',
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to attach research packet');

      setResult({
        title: 'Research packet attached',
        lines: [
          data.message,
          data.client?.primary_offer ? `Offer: ${data.client.primary_offer}` : '',
          data.client?.core_cta ? `CTA: ${data.client.core_cta}` : '',
        ].filter(Boolean),
      });
      await loadClients();
      await loadReadinessStatus(activeClientId, data.pageContext?.assetId || pageContext?.assetId || '');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const stageOnboardingSync = async () => {
    if (!activeClientId) {
      setError('Select an active client first');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/ghl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'stageOnboardingSync',
          clientId: activeClientId,
          data: {
            assetId: pageContext?.assetId || activeClient?.research_packet_id || '',
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to stage onboarding sync');

      setResult({
        title: 'GHL onboarding payload staged',
        lines: [
          data.message,
          data.payload?.primaryOffer ? `Offer: ${data.payload.primaryOffer}` : '',
          data.payload?.coreCta ? `CTA: ${data.payload.coreCta}` : '',
        ].filter(Boolean),
      });
      await loadClients();
      await loadReadinessStatus(activeClientId, pageContext?.assetId || activeClient?.research_packet_id || '');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const runFullOnboarding = async () => {
    if (!activeClientId) {
      setError('Select an active client first');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/ghl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'runFullOnboarding',
          clientId: activeClientId,
          data: {
            assetId: pageContext?.assetId || activeClient?.research_packet_id || '',
            website: activeClient?.website || '',
            service_area: activeClient?.service_area || '',
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to run full onboarding');

      setResult({
        title: 'Full client onboarding staged',
        lines: [
          data.message,
          data.client?.primary_offer ? `Offer: ${data.client.primary_offer}` : '',
          data.client?.core_cta ? `CTA: ${data.client.core_cta}` : '',
          data.client?.managed_site_status ? `Website: ${formatLabel(data.client.managed_site_status, 'Ready to build')}` : '',
          data.client?.crm_setup_status ? `CRM: ${formatLabel(data.client.crm_setup_status, 'Staged')}` : '',
        ].filter(Boolean),
      });
      await loadClients();
      await loadReadinessStatus(activeClientId, data.pageContext?.assetId || pageContext?.assetId || '');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const syncOnboardingToGhl = async () => {
    if (!activeClientId) {
      setError('Select an active client first');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/ghl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'syncOnboardingToGhl',
          clientId: activeClientId,
          data: {
            assetId: pageContext?.assetId || activeClient?.research_packet_id || '',
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to sync onboarding to GHL');

      setResult({
        title: 'Onboarding synced to GHL',
        lines: [
          data.message,
          data.ownerContactId ? `Owner contact: ${shortenId(data.ownerContactId)}` : '',
          data.client?.ghl_last_onboarding_note_id ? `Note: ${shortenId(data.client.ghl_last_onboarding_note_id)}` : '',
          data.customFieldSync?.matchedCount ? `Custom fields mapped: ${data.customFieldSync.matchedCount}` : 'Custom fields mapped: 0',
          Array.isArray(data.customFieldSync?.missingFields) && data.customFieldSync.missingFields.length
            ? `Missing GHL custom fields: ${data.customFieldSync.missingFields.join(', ')}`
            : '',
        ].filter(Boolean),
      });
      await loadClients();
      await loadReadinessStatus(activeClientId, pageContext?.assetId || activeClient?.research_packet_id || '');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const removeClient = async clientId => {
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove', clientId }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to remove client');
      setResult({ title: 'Client removed', lines: ['The sub-account was removed from this workspace.'] });
      setError('');
      await loadClients();
    } catch (err) {
      setError(err.message);
    }
  };

  const createContact = async () => {
    if (!activeClientId) {
      setError('Select a client first');
      return;
    }
    if (!contactForm.email.trim()) {
      setError('Email is required to create a contact');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/ghl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'fullClientSetup',
          clientId: activeClientId,
          data: {
            contact: {
              firstName: contactForm.firstName.trim(),
              lastName: contactForm.lastName.trim(),
              email: contactForm.email.trim(),
              phone: contactForm.phone.trim(),
            },
            niche: contactForm.niche.trim(),
            contentPlan: contactForm.contentPlan.trim(),
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to create contact');

      setResult({
        title: 'Contact created',
        lines: [
          data.message,
          `Contact ${shortenId(data.contactId)}`,
          data.leadId ? `Lead ${shortenId(data.leadId)}` : '',
        ].filter(Boolean),
      });
      setContactForm({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        niche: '',
        contentPlan: '',
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: '100%',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 3,
    color: '#e2e2e8',
    padding: '8px 12px',
    fontSize: 12,
    fontFamily: 'JetBrains Mono',
    outline: 'none',
    marginBottom: 8,
  };

  const labelStyle = {
    fontSize: 9,
    color: '#666',
    letterSpacing: '0.15em',
    textTransform: 'uppercase',
    display: 'block',
    marginBottom: 4,
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: isMobile ? 10 : 24,
    }}>
      <div style={{
        background: '#0d0d14',
        border: '1px solid rgba(245,158,11,0.3)',
        borderRadius: isMobile ? 12 : 4,
        width: '100%',
        maxWidth: isMobile ? '100%' : 760,
        maxHeight: isMobile ? 'calc(100vh - 20px)' : '90vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 0 60px rgba(245,158,11,0.1)',
      }}>
        <div style={{
          padding: isMobile ? '14px 14px 12px' : '14px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{
                fontFamily: 'Orbitron, sans-serif',
                fontSize: 13,
                fontWeight: 700,
                color: '#f59e0b',
                letterSpacing: '0.1em',
              }}>
                GOHIGHLEVEL
              </div>
              <div style={{ fontSize: 10, color: '#444', marginTop: 2 }}>
                {clients.length} sub-accounts connected
              </div>
            </div>
            {agencyStatus?.configured && (
              <div style={{
                padding: '4px 10px',
                background: 'rgba(59,130,246,0.1)',
                border: '1px solid rgba(59,130,246,0.28)',
                borderRadius: 20,
                fontSize: 10,
                color: '#60a5fa',
                fontFamily: 'Orbitron, sans-serif',
              }}>
                Agency Layer Ready
              </div>
            )}
            {activeClient && (
              <div style={{
                padding: '4px 10px',
                background: `${activeClient.color}18`,
                border: `1px solid ${activeClient.color}44`,
                borderRadius: 20,
                fontSize: 10,
                color: activeClient.color,
                fontFamily: 'Orbitron, sans-serif',
              }}>
                Active: {activeClient.name}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{
            background: 'transparent',
            border: '1px solid #333',
            color: '#888',
            padding: '6px 12px',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 11,
            fontFamily: 'JetBrains Mono',
            width: isMobile ? '100%' : 'auto',
          }}>
            CLOSE
          </button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {['agency', 'clients', 'contact', 'pipelines', 'pages'].map(view => (
            <button
              key={view}
              onClick={() => setTabView(view)}
              style={{
                flex: isMobile ? '1 1 33.33%' : 1,
                padding: '10px 0',
                background: tab === view ? 'rgba(245,158,11,0.1)' : 'transparent',
                border: 'none',
                borderBottom: tab === view ? '2px solid #f59e0b' : '2px solid transparent',
                color: tab === view ? '#f59e0b' : '#555',
                fontFamily: 'Orbitron, sans-serif',
                fontSize: 10,
                letterSpacing: '0.1em',
                cursor: 'pointer',
                textTransform: 'uppercase',
              }}
            >
              {view}
            </button>
          ))}
        </div>

        {error && (
          <div style={{
            margin: isMobile ? '12px 12px 0' : '16px 20px 0',
            padding: 12,
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 3,
            fontSize: 11,
            color: '#ef4444',
          }}>
            {error}
          </div>
        )}

        <div style={{ flex: 1, overflow: 'auto', padding: isMobile ? 12 : 20 }}>
          {tab === 'agency' && (
            <div>
              <div style={{
                padding: 14,
                marginBottom: 16,
                background: 'rgba(59,130,246,0.08)',
                border: '1px solid rgba(59,130,246,0.22)',
                borderRadius: 3,
              }}>
                <div style={{ fontSize: 11, color: '#60a5fa', fontWeight: 700, marginBottom: 6 }}>
                  Agency provisioning layer
                </div>
                <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.6 }}>
                  Connect the highest-permission GHL account here. Agent OS will use this layer to provision new client sub-accounts, while daily CRM operations still run against each client sub-account.
                </div>
              </div>

              <div style={{
                padding: 14,
                marginBottom: 16,
                background: agencyStatus?.configured ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)',
                border: `1px solid ${agencyStatus?.configured ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.25)'}`,
                borderRadius: 3,
              }}>
                <div style={{ fontSize: 11, color: agencyStatus?.configured ? '#10b981' : '#f59e0b', fontWeight: 700, marginBottom: 6 }}>
                  {agencyStatus?.configured ? 'Agency auth configured' : 'Agency auth not configured'}
                </div>
                <div style={{ fontSize: 10, color: '#6b7280', lineHeight: 1.6 }}>
                  {agencyStatus?.agencyName || 'No agency name saved'} {agencyStatus?.companyId ? `| Company ${shortenId(agencyStatus.companyId)}` : '| Company ID missing'}
                </div>
              </div>

              <label style={labelStyle}>Agency Name</label>
              <input style={inputStyle} value={agencyForm.agencyName} onChange={e => setAgencyForm(prev => ({ ...prev, agencyName: e.target.value }))} placeholder="OTG Agency" />

              <label style={labelStyle}>Agency Private Integration Token</label>
              <input style={{ ...inputStyle, fontFamily: 'JetBrains Mono' }} type="password" value={agencyForm.agencyApiKey} onChange={e => setAgencyForm(prev => ({ ...prev, agencyApiKey: e.target.value }))} placeholder="Paste the highest-permission agency token" />

              <label style={labelStyle}>Agency Company ID</label>
              <input style={inputStyle} value={agencyForm.companyId} onChange={e => setAgencyForm(prev => ({ ...prev, companyId: e.target.value }))} placeholder="Required to provision new sub-accounts" />

              <div style={{ display: 'flex', gap: 8, marginTop: 6, flexDirection: isMobile ? 'column' : 'row' }}>
                <button onClick={saveAgencySettings} disabled={loading} style={{
                  flex: 1,
                  padding: '10px 0',
                  background: 'rgba(59,130,246,0.14)',
                  border: '1px solid rgba(59,130,246,0.3)',
                  borderRadius: 3,
                  color: '#60a5fa',
                  fontFamily: 'Orbitron, sans-serif',
                  fontSize: 10,
                  cursor: 'pointer',
                  letterSpacing: '0.1em',
                }}>
                  {loading ? 'SAVING...' : 'SAVE AGENCY LAYER'}
                </button>
                <button onClick={validateAgency} disabled={loading || !agencyStatus?.configured} style={{
                  padding: '10px 16px',
                  background: 'rgba(16,185,129,0.12)',
                  border: '1px solid rgba(16,185,129,0.26)',
                  borderRadius: 3,
                  color: '#10b981',
                  cursor: loading || !agencyStatus?.configured ? 'not-allowed' : 'pointer',
                  fontSize: 10,
                  fontFamily: 'Orbitron, sans-serif',
                  letterSpacing: '0.1em',
                  opacity: loading || !agencyStatus?.configured ? 0.6 : 1,
                }}>
                  VALIDATE
                </button>
              </div>
            </div>
          )}

          {tab === 'clients' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 10, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 11, color: '#555' }}>
                  Select the active GHL sub-account for this workspace.
                </div>
                <button onClick={() => setShowAddClient(!showAddClient)} style={{
                  padding: '6px 14px',
                  background: 'rgba(245,158,11,0.1)',
                  border: '1px solid rgba(245,158,11,0.3)',
                  borderRadius: 3,
                  color: '#f59e0b',
                  fontFamily: 'Orbitron, sans-serif',
                  fontSize: 9,
                  letterSpacing: '0.1em',
                  cursor: 'pointer',
                }}>
                  {showAddClient ? 'CLOSE' : '+ ADD CLIENT'}
                </button>
              </div>

              {activeClient && readinessStatus?.readiness && (
                <div style={{
                  padding: 16,
                  marginBottom: 16,
                  background: 'rgba(59,130,246,0.08)',
                  border: '1px solid rgba(59,130,246,0.22)',
                  borderRadius: 3,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: 11, color: '#60a5fa', fontWeight: 700, marginBottom: 4 }}>
                        {activeClient.name} onboarding readiness
                      </div>
                      <div style={{ fontSize: 10, color: '#6b7280', lineHeight: 1.6 }}>
                        {readinessStatus.readiness.completed} of {readinessStatus.readiness.total} critical setup items complete.
                      </div>
                    </div>
                    <div style={{
                      padding: '6px 12px',
                      borderRadius: 20,
                      border: '1px solid rgba(59,130,246,0.3)',
                      color: '#bfdbfe',
                      fontSize: 11,
                      fontFamily: 'Orbitron, sans-serif',
                      letterSpacing: '0.08em',
                    }}>
                      {readinessStatus.readiness.score}% READY
                    </div>
                  </div>

                  <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
                    {readinessStatus.readiness.checks.map(check => (
                      <div key={check.id} style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 10,
                        padding: '8px 10px',
                        borderRadius: 3,
                        background: check.complete ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${check.complete ? 'rgba(16,185,129,0.22)' : 'rgba(255,255,255,0.06)'}`,
                        fontSize: 10,
                      }}>
                        <span style={{ color: check.complete ? '#d1fae5' : '#cbd5e1' }}>{check.label}</span>
                        <span style={{ color: check.complete ? '#10b981' : '#f59e0b', fontFamily: 'Orbitron, sans-serif', letterSpacing: '0.08em' }}>
                          {check.complete ? 'READY' : 'MISSING'}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={runFullOnboarding} disabled={loading || !(activeClient?.research_packet_id || pageContext?.assetId)} style={{
                      padding: '8px 14px',
                      background: !(activeClient?.research_packet_id || pageContext?.assetId) ? 'rgba(255,255,255,0.03)' : 'rgba(245,158,11,0.14)',
                      border: `1px solid ${!(activeClient?.research_packet_id || pageContext?.assetId) ? 'rgba(255,255,255,0.08)' : 'rgba(245,158,11,0.3)'}`,
                      borderRadius: 3,
                      color: !(activeClient?.research_packet_id || pageContext?.assetId) ? '#666' : '#f59e0b',
                      fontFamily: 'Orbitron, sans-serif',
                      fontSize: 9,
                      letterSpacing: '0.08em',
                      cursor: loading || !(activeClient?.research_packet_id || pageContext?.assetId) ? 'not-allowed' : 'pointer',
                      opacity: loading ? 0.6 : 1,
                    }}>
                      {loading ? 'STAGING...' : 'RUN FULL CLIENT ONBOARDING'}
                    </button>
                    <button onClick={attachLatestResearchPacket} disabled={loading || !pageContext?.assetId} style={{
                      padding: '8px 14px',
                      background: !pageContext?.assetId ? 'rgba(255,255,255,0.03)' : 'rgba(59,130,246,0.12)',
                      border: `1px solid ${!pageContext?.assetId ? 'rgba(255,255,255,0.08)' : 'rgba(59,130,246,0.3)'}`,
                      borderRadius: 3,
                      color: !pageContext?.assetId ? '#666' : '#60a5fa',
                      fontFamily: 'Orbitron, sans-serif',
                      fontSize: 9,
                      letterSpacing: '0.08em',
                      cursor: loading || !pageContext?.assetId ? 'not-allowed' : 'pointer',
                      opacity: loading ? 0.6 : 1,
                    }}>
                      {loading ? 'ATTACHING...' : 'ATTACH LATEST PIPELINE PACKET'}
                    </button>
                    <button onClick={stageOnboardingSync} disabled={loading || !(activeClient?.research_packet_id || pageContext?.assetId)} style={{
                      padding: '8px 14px',
                      background: !(activeClient?.research_packet_id || pageContext?.assetId) ? 'rgba(255,255,255,0.03)' : 'rgba(16,185,129,0.12)',
                      border: `1px solid ${!(activeClient?.research_packet_id || pageContext?.assetId) ? 'rgba(255,255,255,0.08)' : 'rgba(16,185,129,0.3)'}`,
                      borderRadius: 3,
                      color: !(activeClient?.research_packet_id || pageContext?.assetId) ? '#666' : '#10b981',
                      fontFamily: 'Orbitron, sans-serif',
                      fontSize: 9,
                      letterSpacing: '0.08em',
                      cursor: loading || !(activeClient?.research_packet_id || pageContext?.assetId) ? 'not-allowed' : 'pointer',
                      opacity: loading ? 0.6 : 1,
                    }}>
                      {loading ? 'STAGING...' : 'STAGE GHL ONBOARDING PAYLOAD'}
                    </button>
                    <button onClick={syncOnboardingToGhl} disabled={loading || !(activeClient?.research_packet_id || pageContext?.assetId)} style={{
                      padding: '8px 14px',
                      background: !(activeClient?.research_packet_id || pageContext?.assetId) ? 'rgba(255,255,255,0.03)' : 'rgba(34,197,94,0.14)',
                      border: `1px solid ${!(activeClient?.research_packet_id || pageContext?.assetId) ? 'rgba(255,255,255,0.08)' : 'rgba(34,197,94,0.3)'}`,
                      borderRadius: 3,
                      color: !(activeClient?.research_packet_id || pageContext?.assetId) ? '#666' : '#4ade80',
                      fontFamily: 'Orbitron, sans-serif',
                      fontSize: 9,
                      letterSpacing: '0.08em',
                      cursor: loading || !(activeClient?.research_packet_id || pageContext?.assetId) ? 'not-allowed' : 'pointer',
                      opacity: loading ? 0.6 : 1,
                    }}>
                      {loading ? 'SYNCING...' : 'SYNC ONBOARDING TO GHL'}
                    </button>
                    <button onClick={() => setTabView('pages')} style={{
                      padding: '8px 14px',
                      background: 'transparent',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 3,
                      color: '#94a3b8',
                      fontFamily: 'Orbitron, sans-serif',
                      fontSize: 9,
                      letterSpacing: '0.08em',
                      cursor: 'pointer',
                    }}>
                      OPEN GHL PAGE BRIEF
                    </button>
                  </div>
                </div>
              )}

              {showAddClient && (
                <div style={{
                  padding: 16,
                  marginBottom: 16,
                  background: 'rgba(245,158,11,0.05)',
                  border: '1px solid rgba(245,158,11,0.2)',
                  borderRadius: 3,
                }}>
                  <div style={{
                    fontFamily: 'Orbitron, sans-serif',
                    fontSize: 11,
                    color: '#f59e0b',
                    marginBottom: 14,
                    letterSpacing: '0.1em',
                  }}>
                    NEW CLIENT SUB-ACCOUNT
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexDirection: isMobile ? 'column' : 'row' }}>
                    {[
                      { id: 'attach', label: 'ATTACH EXISTING' },
                      { id: 'provision', label: 'PROVISION NEW' },
                    ].map(mode => (
                      <button
                        key={mode.id}
                        onClick={() => setClientProvisionMode(mode.id)}
                        style={{
                          flex: 1,
                          padding: '8px 0',
                          background: clientProvisionMode === mode.id ? 'rgba(245,158,11,0.14)' : 'rgba(255,255,255,0.02)',
                          border: `1px solid ${clientProvisionMode === mode.id ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.08)'}`,
                          borderRadius: 3,
                          color: clientProvisionMode === mode.id ? '#f59e0b' : '#666',
                          fontFamily: 'Orbitron, sans-serif',
                          fontSize: 9,
                          letterSpacing: '0.1em',
                          cursor: 'pointer',
                        }}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>

                  <div style={{
                    fontSize: 10,
                    color: '#666',
                    lineHeight: 1.6,
                    marginBottom: 12,
                  }}>
                    {clientProvisionMode === 'provision'
                      ? 'Provision a brand-new client sub-account from the agency layer, then attach it automatically inside Agent OS.'
                      : 'Attach an existing client sub-account by saving its location ID and optional client-specific token.'}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={labelStyle}>Client Name *</label>
                      <input style={inputStyle} value={newClient.name} onChange={e => setNewClient(prev => ({ ...prev, name: e.target.value }))} placeholder="Smith Photography" />
                    </div>
                    <div>
                      <label style={labelStyle}>Niche</label>
                      <input style={inputStyle} value={newClient.niche} onChange={e => setNewClient(prev => ({ ...prev, niche: e.target.value }))} placeholder="Wedding Photography" />
                    </div>
                  </div>

                  {clientProvisionMode === 'attach' ? (
                    <>
                      <label style={labelStyle}>GHL Location ID *</label>
                      <input style={inputStyle} value={newClient.locationId} onChange={e => setNewClient(prev => ({ ...prev, locationId: e.target.value }))} placeholder="abc123xyz from GHL settings" />
                    </>
                  ) : (
                    <>
                      <label style={labelStyle}>Website</label>
                      <input style={inputStyle} value={newClient.website} onChange={e => setNewClient(prev => ({ ...prev, website: e.target.value }))} placeholder="https://clientsite.com" />

                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
                        <div>
                          <label style={labelStyle}>City</label>
                          <input style={inputStyle} value={newClient.city} onChange={e => setNewClient(prev => ({ ...prev, city: e.target.value }))} placeholder="Los Angeles" />
                        </div>
                        <div>
                          <label style={labelStyle}>State</label>
                          <input style={inputStyle} value={newClient.state} onChange={e => setNewClient(prev => ({ ...prev, state: e.target.value }))} placeholder="CA" />
                        </div>
                      </div>
                    </>
                  )}

                  <label style={labelStyle}>GHL API Key (optional)</label>
                  <input style={{ ...inputStyle, fontFamily: 'JetBrains Mono' }} type="password" value={newClient.apiKey} onChange={e => setNewClient(prev => ({ ...prev, apiKey: e.target.value }))} placeholder="Leave blank to use agency default key" />

                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={labelStyle}>Client Email</label>
                      <input style={inputStyle} value={newClient.email} onChange={e => setNewClient(prev => ({ ...prev, email: e.target.value }))} placeholder="client@email.com" />
                    </div>
                    <div>
                      <label style={labelStyle}>Client Phone</label>
                      <input style={inputStyle} value={newClient.phone} onChange={e => setNewClient(prev => ({ ...prev, phone: e.target.value }))} placeholder="+1 555 000 0000" />
                    </div>
                  </div>

                  <label style={labelStyle}>Color Tag</label>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    {COLORS.map(color => (
                      <div
                        key={color}
                        onClick={() => setNewClient(prev => ({ ...prev, color }))}
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: '50%',
                          background: color,
                          cursor: 'pointer',
                          border: newClient.color === color ? '2px solid #fff' : '2px solid transparent',
                        }}
                      />
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexDirection: isMobile ? 'column' : 'row' }}>
                    <button onClick={addClient} disabled={loading} style={{
                      flex: 1,
                      padding: '10px 0',
                      background: 'rgba(245,158,11,0.2)',
                      border: '1px solid rgba(245,158,11,0.4)',
                      borderRadius: 3,
                      color: '#f59e0b',
                      fontFamily: 'Orbitron, sans-serif',
                      fontSize: 10,
                      cursor: 'pointer',
                      letterSpacing: '0.1em',
                    }}>
                      {loading ? (clientProvisionMode === 'provision' ? 'PROVISIONING...' : 'ADDING...') : (clientProvisionMode === 'provision' ? 'PROVISION CLIENT' : 'ADD CLIENT')}
                    </button>
                    <button onClick={() => setShowAddClient(false)} style={{
                      padding: '10px 16px',
                      background: 'transparent',
                      border: '1px solid #333',
                      borderRadius: 3,
                      color: '#555',
                      cursor: 'pointer',
                      fontSize: 11,
                      fontFamily: 'JetBrains Mono',
                    }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {clients.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#333', fontSize: 12 }}>
                  No clients added yet. Add a sub-account to start using the GHL connector.
                </div>
              ) : (
                clients.map(client => (
                  <div
                    key={client.id}
                    style={{
                      padding: 14,
                      marginBottom: 8,
                      background: activeClientId === client.id ? `${client.color}12` : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${activeClientId === client.id ? `${client.color}44` : 'rgba(255,255,255,0.06)'}`,
                      borderRadius: 3,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                    onClick={() => switchClient(client.id)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          background: client.color,
                          boxShadow: activeClientId === client.id ? `0 0 8px ${client.color}` : 'none',
                        }} />
                        <div>
                          <div style={{
                            fontFamily: 'Orbitron, sans-serif',
                            fontSize: 12,
                            fontWeight: 700,
                            color: activeClientId === client.id ? client.color : '#e2e2e8',
                          }}>
                            {client.name}
                          </div>
                          <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>
                            {client.niche || 'No niche set'} | Location {shortenId(client.locationId)}
                          </div>
                          <div style={{ fontSize: 9, color: client.ghl_onboarding_sync_status === 'staged' || client.ghl_onboarding_sync_status === 'synced' ? '#10b981' : '#666', marginTop: 4, letterSpacing: '0.08em' }}>
                            Onboarding payload: {formatLabel(client.ghl_onboarding_sync_status || 'not_synced', 'Not synced')}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {activeClientId === client.id && (
                          <span style={{
                            fontSize: 9,
                            color: client.color,
                            fontFamily: 'Orbitron, sans-serif',
                            letterSpacing: '0.1em',
                          }}>
                            ACTIVE
                          </span>
                        )}
                        <button
                          onClick={event => {
                            event.stopPropagation();
                            removeClient(client.id);
                          }}
                          style={{
                            background: 'transparent',
                            border: '1px solid rgba(239,68,68,0.3)',
                            color: '#ef4444',
                            padding: '3px 8px',
                            borderRadius: 2,
                            cursor: 'pointer',
                            fontSize: 10,
                            fontFamily: 'JetBrains Mono',
                          }}
                        >
                          X
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'contact' && (
            <div>
              {!activeClient ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#555', fontSize: 12 }}>
                  Select an active client in the Clients tab first.
                </div>
              ) : (
                <div>
                  <div style={{
                    padding: '8px 12px',
                    marginBottom: 16,
                    background: `${activeClient.color}12`,
                    border: `1px solid ${activeClient.color}33`,
                    borderRadius: 3,
                    fontSize: 11,
                    color: activeClient.color,
                  }}>
                    Creating contact in {activeClient.name} ({activeClient.niche || 'General niche'})
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={labelStyle}>First Name</label>
                      <input style={inputStyle} value={contactForm.firstName} onChange={e => setContactForm(prev => ({ ...prev, firstName: e.target.value }))} placeholder="John" />
                    </div>
                    <div>
                      <label style={labelStyle}>Last Name</label>
                      <input style={inputStyle} value={contactForm.lastName} onChange={e => setContactForm(prev => ({ ...prev, lastName: e.target.value }))} placeholder="Smith" />
                    </div>
                  </div>

                  <label style={labelStyle}>Email *</label>
                  <input style={inputStyle} value={contactForm.email} onChange={e => setContactForm(prev => ({ ...prev, email: e.target.value }))} placeholder="john@example.com" />

                  <label style={labelStyle}>Phone</label>
                  <input style={inputStyle} value={contactForm.phone} onChange={e => setContactForm(prev => ({ ...prev, phone: e.target.value }))} placeholder="+1 555 000 0000" />

                  <label style={labelStyle}>Niche</label>
                  <input style={inputStyle} value={contactForm.niche} onChange={e => setContactForm(prev => ({ ...prev, niche: e.target.value }))} placeholder="Wedding Photography" />

                  <label style={labelStyle}>Content Plan Notes</label>
                  <textarea style={{ ...inputStyle, height: 70, resize: 'vertical' }} value={contactForm.contentPlan} onChange={e => setContactForm(prev => ({ ...prev, contentPlan: e.target.value }))} placeholder="15 scripts written, ManyChat funnel ready..." />

                  <button onClick={createContact} disabled={loading || !contactForm.email.trim()} style={{
                    width: '100%',
                    padding: '12px 0',
                    background: loading ? 'rgba(245,158,11,0.08)' : 'rgba(245,158,11,0.18)',
                    border: '1px solid rgba(245,158,11,0.4)',
                    borderRadius: 3,
                    color: '#f59e0b',
                    fontFamily: 'Orbitron, sans-serif',
                    fontSize: 11,
                    letterSpacing: '0.1em',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    opacity: loading ? 0.6 : 1,
                    marginTop: 4,
                  }}>
                    {loading ? 'CREATING...' : `ADD TO ${activeClient.name.toUpperCase()}`}
                  </button>

                  {result && (
                    <div style={{
                      marginTop: 12,
                      padding: 14,
                      background: 'rgba(16,185,129,0.08)',
                      border: '1px solid rgba(16,185,129,0.3)',
                      borderRadius: 3,
                    }}>
                      <div style={{ fontSize: 11, color: '#10b981', marginBottom: 6, fontWeight: 700 }}>
                        {result.title}
                      </div>
                      {result.lines?.map((line, index) => (
                        <div key={index} style={{ fontSize: 10, color: '#555', marginTop: index === 0 ? 0 : 4 }}>
                          {line}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === 'pipelines' && (
            <div>
              {!activeClient ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#555', fontSize: 12 }}>
                  Select an active client first.
                </div>
              ) : pipelines.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#444', fontSize: 12 }}>
                  No pipelines found in {activeClient.name}.
                </div>
              ) : (
                pipelines.map((pipeline, index) => (
                  <div key={pipeline.id || index} style={{
                    padding: 14,
                    marginBottom: 8,
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 3,
                  }}>
                    <div style={{
                      fontFamily: 'Orbitron, sans-serif',
                      fontSize: 11,
                      color: '#f59e0b',
                    }}>
                      {pipeline.name}
                    </div>
                    <div style={{ fontSize: 10, color: '#444', marginTop: 4 }}>
                      {(pipeline.stages?.length || 0)} stages | Pipeline {shortenId(pipeline.id)}
                    </div>
                    {pipeline.stages?.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                        {pipeline.stages.map((stage, stageIndex) => (
                          <span key={stage.id || stageIndex} style={{
                            fontSize: 9,
                            padding: '2px 8px',
                            background: 'rgba(245,158,11,0.1)',
                            border: '1px solid rgba(245,158,11,0.2)',
                            borderRadius: 10,
                            color: '#f59e0b',
                          }}>
                            {formatLabel(stage.name, `Stage ${stageIndex + 1}`)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'pages' && (
            <div>
              <div style={{
                padding: '8px 12px',
                marginBottom: 16,
                background: 'rgba(59,130,246,0.1)',
                border: '1px solid rgba(59,130,246,0.25)',
                borderRadius: 3,
                fontSize: 11,
                color: '#60a5fa',
              }}>
                This pulls the latest usable pipeline context into a GHL-ready page brief so you do not have to copy notes by hand.
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, flexDirection: isMobile ? 'column' : 'row' }}>
              <button onClick={loadPageContext} style={{
                padding: '8px 14px',
                background: 'rgba(59,130,246,0.12)',
                border: '1px solid rgba(59,130,246,0.3)',
                borderRadius: 3,
                color: '#60a5fa',
                fontFamily: 'Orbitron, sans-serif',
                fontSize: 10,
                letterSpacing: '0.08em',
                cursor: 'pointer',
                width: isMobile ? '100%' : 'auto',
              }}>
                REFRESH PIPELINE PAGE CONTEXT
              </button>
              {activeClient && (
                <button onClick={runFullOnboarding} disabled={loading || !pageContext?.assetId} style={{
                  padding: '8px 14px',
                  background: !pageContext?.assetId ? 'rgba(255,255,255,0.03)' : 'rgba(245,158,11,0.14)',
                  border: `1px solid ${!pageContext?.assetId ? 'rgba(255,255,255,0.08)' : 'rgba(245,158,11,0.3)'}`,
                  borderRadius: 3,
                  color: !pageContext?.assetId ? '#666' : '#f59e0b',
                  fontFamily: 'Orbitron, sans-serif',
                  fontSize: 10,
                  letterSpacing: '0.08em',
                  cursor: loading || !pageContext?.assetId ? 'not-allowed' : 'pointer',
                  width: isMobile ? '100%' : 'auto',
                  opacity: loading ? 0.6 : 1,
                }}>
                  {loading ? 'STAGING...' : 'RUN FULL CLIENT ONBOARDING'}
                </button>
              )}
              {activeClient && (
                <button onClick={attachLatestResearchPacket} disabled={loading || !pageContext?.assetId} style={{
                  padding: '8px 14px',
                  background: !pageContext?.assetId ? 'rgba(255,255,255,0.03)' : 'rgba(16,185,129,0.12)',
                  border: `1px solid ${!pageContext?.assetId ? 'rgba(255,255,255,0.08)' : 'rgba(16,185,129,0.3)'}`,
                  borderRadius: 3,
                  color: !pageContext?.assetId ? '#666' : '#10b981',
                  fontFamily: 'Orbitron, sans-serif',
                  fontSize: 10,
                  letterSpacing: '0.08em',
                  cursor: loading || !pageContext?.assetId ? 'not-allowed' : 'pointer',
                  width: isMobile ? '100%' : 'auto',
                  opacity: loading ? 0.6 : 1,
                }}>
                  {loading ? 'ATTACHING...' : `ATTACH TO ${activeClient.name.toUpperCase()}`}
                </button>
              )}
              {activeClient && (
                <button onClick={syncOnboardingToGhl} disabled={loading || !(activeClient?.research_packet_id || pageContext?.assetId)} style={{
                  padding: '8px 14px',
                  background: !(activeClient?.research_packet_id || pageContext?.assetId) ? 'rgba(255,255,255,0.03)' : 'rgba(34,197,94,0.14)',
                  border: `1px solid ${!(activeClient?.research_packet_id || pageContext?.assetId) ? 'rgba(255,255,255,0.08)' : 'rgba(34,197,94,0.3)'}`,
                  borderRadius: 3,
                  color: !(activeClient?.research_packet_id || pageContext?.assetId) ? '#666' : '#4ade80',
                  fontFamily: 'Orbitron, sans-serif',
                  fontSize: 10,
                  letterSpacing: '0.08em',
                  cursor: loading || !(activeClient?.research_packet_id || pageContext?.assetId) ? 'not-allowed' : 'pointer',
                  width: isMobile ? '100%' : 'auto',
                  opacity: loading ? 0.6 : 1,
                }}>
                  {loading ? 'SYNCING...' : 'SYNC TO GHL NOW'}
                </button>
              )}
              </div>

              {!pageContext || !ghlPageBrief ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#555', fontSize: 12 }}>
                  No page context is ready yet. Run a pipeline first, then come back here.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 12 }}>
                  <div style={{
                    padding: 14,
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 3,
                  }}>
                    <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 11, color: '#f59e0b', marginBottom: 6 }}>
                      PIPELINE SOURCE
                    </div>
                    <div style={{ fontSize: 12, color: '#ddd', lineHeight: 1.7 }}>
                      <div>Asset: {pageContext.assetId}</div>
                      <div>Topic: {pageContext.topic}</div>
                      <div>Niche: {pageContext.niche || 'Not set'}</div>
                      <div>Platforms: {(pageContext.platforms || []).join(', ') || 'Not set'}</div>
                    </div>
                  </div>

                  <div style={{
                    padding: 14,
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 3,
                  }}>
                    <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 11, color: '#f59e0b', marginBottom: 8 }}>
                      GHL PAGE BRIEF
                    </div>
                    <div style={{ fontSize: 12, color: '#ddd', lineHeight: 1.7 }}>
                      <div><strong>Headline:</strong> {ghlPageBrief.title}</div>
                      <div><strong>Subheadline:</strong> {ghlPageBrief.subheadline}</div>
                      <div><strong>CTA:</strong> {ghlPageBrief.cta}</div>
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 6 }}>BENEFITS</div>
                      {(ghlPageBrief.benefitBullets || []).map((item, index) => (
                        <div key={index} style={{ fontSize: 12, color: '#ccc', marginBottom: 4 }}>- {item}</div>
                      ))}
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 6 }}>PROCESS</div>
                      {(ghlPageBrief.processBullets || []).map((item, index) => (
                        <div key={index} style={{ fontSize: 12, color: '#ccc', marginBottom: 4 }}>{index + 1}. {item}</div>
                      ))}
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 6 }}>STRATEGY NOTES</div>
                      <div style={{
                        fontSize: 11,
                        color: '#aaa',
                        whiteSpace: 'pre-wrap',
                        maxHeight: 180,
                        overflow: 'auto',
                        padding: 10,
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: 3,
                      }}>
                        {ghlPageBrief.notes || 'No notes yet'}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
