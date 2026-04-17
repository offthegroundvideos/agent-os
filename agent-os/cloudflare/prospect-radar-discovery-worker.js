const CATEGORY_PRESETS = {
  weddings: {
    niche: 'wedding photography',
    year: '2027',
  },
  festivals: {
    niche: 'festival photographer videographer',
    year: '2027',
  },
  automotive: {
    niche: 'car repair mechanic body shop',
    year: '',
  },
  general: {
    niche: '',
    year: '',
  },
};

function compact(value = '', max = 500) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value) return [value];
  return [];
}

function normalizePayload(body = {}) {
  const category = String(body.category || 'general').trim().toLowerCase();
  const preset = CATEGORY_PRESETS[category] || CATEGORY_PRESETS.general;
  return {
    category,
    niche: compact(body.niche || preset.niche || '', 160),
    location: compact(body.location || '', 160),
    year: compact(body.year || preset.year || '', 8),
    limit: Math.max(1, Math.min(20, Number(body.limit || 8))),
  };
}

function buildSearchQueries({ category, niche, location, year }) {
  const topic = compact(niche || 'wedding photography', 160);
  const yearSuffix = year ? ` ${year}` : '';
  const place = location ? ` ${location}` : '';
  const base = `${topic}${yearSuffix}`.trim();

  const generic = [
    `"${base}" ("looking for" OR need OR recommend OR hiring)${place}`,
    `"${base}" ("photographer" OR videographer OR mechanic OR "camera crew" OR "body shop")${place}`,
    `site:reddit.com "${base}" ("looking for" OR need OR recommend OR hiring)${place}`,
    `"${base}" ("forum" OR "community board" OR "event board" OR classifieds)${place}`,
  ];

  if (category === 'weddings') {
    return [
      `"${base}" ("looking for photographer" OR "need videographer" OR "wedding photographer recommendation")${place}`,
      `site:facebook.com "${base}" ("looking for photographer" OR "need videographer")${place}`,
      `"${base}" ("weddingwire" OR "the knot" OR bride OR wedding forum) ("looking for" OR recommendation)${place}`,
      ...generic,
    ];
  }

  if (category === 'festivals') {
    return [
      `"${base}" ("festival" OR "music festival" OR fair) ("hiring photographer" OR "need videographer" OR "media team")${place}`,
      `"${base}" ("call for media" OR "photographer needed" OR "videographer needed")${place}`,
      `"${base}" ("event board" OR "vendor board" OR "festival forum")${place}`,
      ...generic,
    ];
  }

  if (category === 'automotive') {
    return [
      `"${base}" ("need mechanic" OR "looking for body shop" OR "auto repair recommendation")${place}`,
      `"${base}" ("car forum" OR "garage forum" OR "local board") ("looking for" OR recommendation)${place}`,
      `site:reddit.com "${base}" ("need mechanic" OR "body shop" OR "car repair")${place}`,
      ...generic,
    ];
  }

  return generic;
}

function inferSourcePlatform(url = '') {
  const raw = String(url || '').toLowerCase();
  if (raw.includes('facebook.com')) return 'public-facebook';
  if (raw.includes('reddit.com')) return 'reddit';
  if (raw.includes('nextdoor.com')) return 'nextdoor-manual';
  if (raw.includes('weddingwire.com') || raw.includes('theknot.com')) return 'wedding-forum';
  return 'public-web';
}

function inferSourceLabel(url = '') {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host || 'Public web';
  } catch {
    return 'Public web';
  }
}

function inferRequestedService(text = '') {
  const lower = text.toLowerCase();
  if (lower.includes('videographer')) return 'videographer';
  if (lower.includes('photographer')) return 'photographer';
  if (lower.includes('mechanic')) return 'mechanic';
  if (lower.includes('body shop')) return 'body shop';
  if (lower.includes('car repair')) return 'car repair';
  return '';
}

async function firecrawlSearch(env, query, location, limit) {
  if (!env.FIRECRAWL_API_KEY) {
    throw new Error('Missing FIRECRAWL_API_KEY');
  }

  const response = await fetch('https://api.firecrawl.dev/v1/search', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.FIRECRAWL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      limit,
      location: location || undefined,
      timeout: 60000,
      ignoreInvalidURLs: true,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Firecrawl search failed (${response.status}): ${body}`);
  }

  const json = await response.json();
  return toArray(json?.data);
}

function normalizeSearchResult(result, context, query) {
  const title = compact(result?.title || result?.metadata?.title || 'Untitled opportunity', 180);
  const summary = compact(result?.description || result?.metadata?.description || '', 700);
  const sourceUrl = String(result?.url || result?.metadata?.sourceURL || '').trim();
  const combined = `${title} ${summary}`;

  return {
    recordType: 'prospect_opportunity',
    title,
    niche: context.niche,
    requestedService: inferRequestedService(combined) || context.niche,
    sourcePlatform: inferSourcePlatform(sourceUrl),
    sourceLabel: inferSourceLabel(sourceUrl),
    sourceUrl,
    location: context.location,
    postedAt: new Date().toISOString(),
    summary,
    outreachAngle: `Lead with relevant proof for ${context.niche} and confirm availability${context.year ? ` for ${context.year}` : ''}.`,
    queryUsed: query,
    discoveredFrom: 'firecrawl-search',
  };
}

function dedupeByUrl(records = []) {
  const seen = new Set();
  return records.filter((record) => {
    const key = String(record?.sourceUrl || '').trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function sendToAgentOs(env, records) {
  const response = await fetch(`${env.AGENT_OS_BASE_URL}/api/cloudflare-ingest`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-ingest-secret': env.CLOUDFLARE_INGEST_SECRET || '',
    },
    body: JSON.stringify({ records }),
  });

  const text = await response.text();
  return {
    status: response.status,
    ok: response.ok,
    body: text,
  };
}

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      const body = await request.json();
      const context = normalizePayload(body);
      const queries = buildSearchQueries(context);
      const perQueryLimit = Math.max(2, Math.min(10, context.limit));

      let records = [];
      for (const query of queries) {
        const results = await firecrawlSearch(env, query, context.location, perQueryLimit);
        records.push(...results.map((item) => normalizeSearchResult(item, context, query)));
      }

      records = dedupeByUrl(records).slice(0, context.limit);
      const ingest = await sendToAgentOs(env, records);

      return new Response(JSON.stringify({
        success: true,
        category: context.category,
        niche: context.niche,
        location: context.location,
        year: context.year,
        queries,
        generatedRecords: records.length,
        ingestStatus: ingest.status,
        ingestOk: ingest.ok,
        ingestBody: ingest.body,
      }, null, 2), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    } catch (error) {
      return new Response(JSON.stringify({
        success: false,
        error: error.message,
      }, null, 2), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    }
  },
};
