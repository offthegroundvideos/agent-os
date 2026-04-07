import { chromium } from 'playwright-core';

const SUPPORTED_PLATFORMS = ['instagram', 'tiktok', 'youtube', 'linkedin'];
const SUPPORTED_DISCOVERY_PROVIDERS = ['browser_search', 'firecrawl'];
const FIRECRAWL_BASE_URL = process.env.FIRECRAWL_BASE_URL || 'https://api.firecrawl.dev';
const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY || '';

function detectPlatform(url = '') {
  const lower = String(url).toLowerCase();
  if (lower.includes('instagram.com')) return 'instagram';
  if (lower.includes('tiktok.com')) return 'tiktok';
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'youtube';
  if (lower.includes('linkedin.com')) return 'linkedin';
  return 'other';
}

async function launchBestBrowser() {
  const attempts = [{ channel: 'msedge' }, { channel: 'chrome' }];
  let lastError;
  for (const attempt of attempts) {
    try {
      return await chromium.launch({ headless: true, channel: attempt.channel });
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Could not launch Edge or Chrome: ${lastError?.message || 'unknown error'}`);
}

function parseCompactNumber(value) {
  const raw = String(value || '').trim().replace(/,/g, '');
  if (!raw) return 0;
  const suffix = raw.slice(-1).toUpperCase();
  const multiplier = suffix === 'K' ? 1000 : suffix === 'M' ? 1000000 : suffix === 'B' ? 1000000000 : 1;
  const numberPart = multiplier === 1 ? raw : raw.slice(0, -1);
  const num = Number(numberPart);
  return Number.isFinite(num) ? Math.round(num * multiplier) : 0;
}

function extractNumber(text, keywords = []) {
  if (!text || !keywords.length) return 0;
  const patterns = [
    new RegExp(`([\\d.,]+\\s*[KMB]?)\\s+(?:${keywords.join('|')})`, 'i'),
    new RegExp(`(?:${keywords.join('|')})\\s*[:\\-]?\\s*([\\d.,]+\\s*[KMB]?)`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return parseCompactNumber(match[1]);
  }
  return 0;
}

function cleanLine(value = '', max = 220) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function pickFirst(...values) {
  return values.find(Boolean) || '';
}

function getHandleFromUrl(url = '') {
  const parts = String(url).split('/').filter(Boolean);
  const hostIndex = parts.findIndex(part => part.includes('.'));
  const pathParts = hostIndex >= 0 ? parts.slice(hostIndex + 1) : parts;
  return (pathParts[0] || '').replace(/^@/, '');
}

function getTopicFromText(title = '', description = '') {
  return cleanLine(title || description, 120);
}

function normalizeUrlList(urls = []) {
  return [...new Set(urls.map(item => String(item || '').trim()).filter(Boolean))];
}

function normalizePlatforms(platforms = [], fallbackPlatform = '') {
  const values = Array.isArray(platforms) ? platforms : String(platforms || '').split(',');
  const normalized = normalizeUrlList(values.map(item => String(item || '').toLowerCase()));
  if (normalized.length) return normalized.filter(item => SUPPORTED_PLATFORMS.includes(item));
  if (fallbackPlatform && SUPPORTED_PLATFORMS.includes(String(fallbackPlatform).toLowerCase())) {
    return [String(fallbackPlatform).toLowerCase()];
  }
  return [];
}

function normalizeDiscoveryProviders(input = []) {
  const values = Array.isArray(input) ? input : String(input || '').split(',');
  const normalized = normalizeUrlList(values.map(item => String(item || '').toLowerCase()));
  if (normalized.length) return normalized.filter(item => SUPPORTED_DISCOVERY_PROVIDERS.includes(item));
  return FIRECRAWL_API_KEY ? ['browser_search', 'firecrawl'] : ['browser_search'];
}

function buildNicheQueries({ niche = '', platform = '', dateLabel = '' }) {
  const cleanNiche = String(niche || '').trim();
  const todayPhrase = dateLabel || 'today';
  if (!cleanNiche) return [];

  const platformLabels = {
    instagram: ['Instagram Reels', 'viral instagram reel'],
    tiktok: ['TikTok', 'viral tiktok'],
    youtube: ['YouTube Shorts', 'viral youtube shorts'],
    linkedin: ['LinkedIn post', 'viral linkedin post'],
  };

  return (platformLabels[platform] || [platform])
    .flatMap(label => ([
      `${cleanNiche} ${label} ${todayPhrase}`,
      `${cleanNiche} ${label} trending ${todayPhrase}`,
      `${cleanNiche} ${label} viral ${todayPhrase}`,
      `${cleanNiche} ${label} short video ${todayPhrase}`,
      `${cleanNiche} ${label} creator ${todayPhrase}`,
    ]));
}

async function searchDuckDuckGo(query, maxResults = 8) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36',
    },
  });
  if (!response.ok) throw new Error(`Search failed for "${query}" (${response.status})`);
  const html = await response.text();
  const hrefs = [...html.matchAll(/<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"/gi)]
    .map(match => match[1])
    .filter(Boolean)
    .map(href => {
      try {
        const decoded = href.startsWith('//duckduckgo.com/l/?')
          ? new URL(`https:${href}`)
          : new URL(href, 'https://html.duckduckgo.com');
        const uddg = decoded.searchParams.get('uddg');
        return uddg ? decodeURIComponent(uddg) : decoded.toString();
      } catch {
        return href;
      }
    });
  return normalizeUrlList(hrefs).slice(0, maxResults);
}

async function searchBing(query, maxResults = 8) {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36',
    },
  });
  if (!response.ok) throw new Error(`Bing search failed for "${query}" (${response.status})`);
  const html = await response.text();
  const hrefs = [...html.matchAll(/<h2[^>]*>\s*<a[^>]+href="([^"]+)"/gi)]
    .map(match => match[1])
    .filter(Boolean);
  return normalizeUrlList(hrefs).slice(0, maxResults);
}

async function searchWebForCandidateUrls(query, maxResults = 8) {
  const seen = new Set();
  const combined = [];
  for (const searchFn of [searchDuckDuckGo, searchBing]) {
    try {
      const results = await searchFn(query, maxResults);
      for (const url of results) {
        if (!seen.has(url)) {
          seen.add(url);
          combined.push(url);
        }
      }
      if (combined.length >= maxResults) break;
    } catch {}
  }
  return combined.slice(0, maxResults);
}

async function searchFirecrawlForCandidateUrls(query, maxResults = 8) {
  if (!FIRECRAWL_API_KEY) return [];

  const response = await fetch(`${FIRECRAWL_BASE_URL.replace(/\/$/, '')}/v1/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
    },
    body: JSON.stringify({
      query,
      limit: maxResults,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Firecrawl search failed for "${query}" (${response.status}) ${text}`.trim());
  }

  const payload = await response.json();
  const rows = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.results)
      ? payload.results
      : [];

  const urls = rows.flatMap((item) => {
    if (typeof item === 'string') return [item];
    return [
      item?.url,
      item?.sourceURL,
      item?.sourceUrl,
      item?.metadata?.url,
      item?.metadata?.sourceURL,
    ].filter(Boolean);
  });

  return normalizeUrlList(urls).slice(0, maxResults);
}

async function searchCandidateUrls(query, providers = [], maxResults = 8) {
  const selectedProviders = normalizeDiscoveryProviders(providers);
  const seen = new Set();
  const combined = [];

  for (const provider of selectedProviders) {
    try {
      const results = provider === 'firecrawl'
        ? await searchFirecrawlForCandidateUrls(query, maxResults)
        : await searchWebForCandidateUrls(query, maxResults);
      for (const url of results) {
        if (!seen.has(url)) {
          seen.add(url);
          combined.push(url);
        }
      }
      if (combined.length >= maxResults) break;
    } catch {}
  }

  return combined.slice(0, maxResults);
}

async function collectBatchFromNiche({ niche = '', platforms = [], maxVideos = 16, dateLabel = '', discoveryProviders = [] }) {
  const grouped = createGroupedResult();
  const selectedPlatforms = normalizePlatforms(platforms);
  const selectedProviders = normalizeDiscoveryProviders(discoveryProviders);

  for (const platform of selectedPlatforms) {
    const queries = buildNicheQueries({ niche, platform, dateLabel });
    const discoveredUrls = [];

    for (const query of queries) {
      try {
        const results = await searchCandidateUrls(query, selectedProviders, 8);
        for (const candidate of results) {
          if (detectPlatform(candidate) === platform && isDirectVideoUrl(platform, candidate)) {
            discoveredUrls.push(candidate);
          }
        }
      } catch (error) {
        pushGroupedValue(grouped.errorsByPlatform, platform, { query, error: error.message || String(error) });
      }
    }

    const uniqueUrls = normalizeUrlList(discoveredUrls).slice(0, maxVideos);
    if (!uniqueUrls.length) {
      pushGroupedValue(grouped.skippedByPlatform, platform, { niche, reason: 'no_candidate_urls_found' });
      continue;
    }

    const result = await collectBatchFromUrls({ urls: uniqueUrls, niche, platform, platforms: [platform] });
    if (result.resultsByPlatform?.[platform]?.videos?.length) {
      grouped.resultsByPlatform[platform] = {
        videos: [
          ...(grouped.resultsByPlatform[platform]?.videos || []),
          ...result.resultsByPlatform[platform].videos,
        ],
      };
    }
    if (result.errorsByPlatform?.[platform]?.length) {
      grouped.errorsByPlatform[platform] = [
        ...(grouped.errorsByPlatform[platform] || []),
        ...result.errorsByPlatform[platform],
      ];
    }
    if (result.skippedByPlatform?.[platform]?.length) {
      grouped.skippedByPlatform[platform] = [
        ...(grouped.skippedByPlatform[platform] || []),
        ...result.skippedByPlatform[platform],
      ];
    }
  }

  const videos = Object.values(grouped.resultsByPlatform).flatMap(group => group.videos || []);
  const platformSummary = Object.fromEntries(
    selectedPlatforms.map((platform) => [platform, {
      imported: (grouped.resultsByPlatform[platform]?.videos || []).length,
      errors: (grouped.errorsByPlatform[platform] || []).length,
      skipped: (grouped.skippedByPlatform[platform] || []).length,
    }])
  );

  return {
    videos,
    ...grouped,
    platformSummary,
    discoveryProvidersUsed: selectedProviders,
  };
}

function createGroupedResult() {
  return {
    resultsByPlatform: {},
    errorsByPlatform: {},
    skippedByPlatform: {},
  };
}

function pushGroupedValue(container, key, value) {
  if (!container[key]) container[key] = [];
  container[key].push(value);
}

const PLATFORM_EXTRACTORS = {
  instagram: {
    sourceType: (url = '') => (String(url).includes('/reel/') ? 'reel' : 'post'),
    defaultFormat: 'talking-head',
    defaultEditComplexity: 'basic',
    metricKeywords: {
      views: ['views', 'view'],
      followers: ['followers', 'follower'],
      likes: ['likes', 'like'],
      comments: ['comments', 'comment'],
      shares: ['shares', 'share'],
    },
  },
  tiktok: {
    sourceType: () => 'short',
    defaultFormat: 'talking-head',
    defaultEditComplexity: 'medium',
    metricKeywords: {
      views: ['views', 'view'],
      followers: ['followers', 'follower'],
      likes: ['likes', 'like'],
      comments: ['comments', 'comment'],
      shares: ['shares', 'share'],
    },
  },
  youtube: {
    sourceType: (url = '') => (String(url).includes('/shorts/') ? 'short' : 'video'),
    defaultFormat: 'screen-recording',
    defaultEditComplexity: 'medium',
    metricKeywords: {
      views: ['views', 'view'],
      followers: ['subscribers', 'subscriber'],
      likes: ['likes', 'like'],
      comments: ['comments', 'comment'],
      shares: ['shares', 'share'],
    },
  },
  linkedin: {
    sourceType: () => 'post',
    defaultFormat: 'talking-head',
    defaultEditComplexity: 'basic',
    metricKeywords: {
      views: ['views', 'view'],
      followers: ['followers', 'follower'],
      likes: ['reactions', 'likes', 'like'],
      comments: ['comments', 'comment'],
      shares: ['reposts', 'shares', 'share'],
    },
  },
};

async function collectRawPage(url) {
  const browser = await launchBestBrowser();
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36',
    });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2500);

    return await page.evaluate(() => {
      const readMeta = (...names) => {
        for (const name of names) {
          const selector = `meta[name="${name}"],meta[property="${name}"]`;
          const node = document.querySelector(selector);
          const value = node?.getAttribute('content');
          if (value) return value;
        }
        return '';
      };

      const visibleText = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
      const lines = visibleText
        .split(/(?<=[.!?])\s+/)
        .map(line => line.trim())
        .filter(Boolean)
        .slice(0, 80);

      return {
        finalUrl: location.href,
        title: document.title || '',
        description: readMeta('description', 'og:description', 'twitter:description'),
        ogTitle: readMeta('og:title', 'twitter:title'),
        author: readMeta('author', 'profile:username', 'og:site_name'),
        publishedAt: readMeta('article:published_time', 'og:published_time', 'video:release_date', 'date', 'parsely-pub-date'),
        image: readMeta('og:image', 'twitter:image'),
        canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') || '',
        visibleText,
        lines,
      };
    });
  } finally {
    await browser.close();
  }
}

function buildDraftFromExtraction({ url, niche = '', platform = '', extracted }) {
  const resolvedPlatform = platform || detectPlatform(extracted.finalUrl || url);
  const extractor = PLATFORM_EXTRACTORS[resolvedPlatform] || PLATFORM_EXTRACTORS.instagram;
  const searchableText = [extracted.title, extracted.ogTitle, extracted.description, extracted.visibleText].join(' ');
  const creatorHandle = cleanLine(pickFirst(extracted.author, getHandleFromUrl(extracted.finalUrl || url)), 80).replace(/^@/, '');
  const creatorName = cleanLine(pickFirst(extracted.author, creatorHandle), 100);
  const topic = getTopicFromText(pickFirst(extracted.ogTitle, extracted.title), extracted.description);
  const subject = cleanLine(extracted.description || topic, 180);
  const hookCandidates = extracted.lines.slice(0, 12);

  return {
    sourceUrl: url,
    finalUrl: extracted.finalUrl || url,
    platform: resolvedPlatform,
    niche,
    draft: {
      niche,
      platform: resolvedPlatform,
      creatorName,
      creatorHandle,
      followerCount: extractNumber(searchableText, extractor.metricKeywords.followers),
      viewCount: extractNumber(searchableText, extractor.metricKeywords.views),
      likeCount: extractNumber(searchableText, extractor.metricKeywords.likes),
      commentCount: extractNumber(searchableText, extractor.metricKeywords.comments),
      shareCount: extractNumber(searchableText, extractor.metricKeywords.shares),
      url: extracted.finalUrl || url,
      topic,
      subject,
      visualHook: cleanLine(hookCandidates[0] || ''),
      writtenHook: cleanLine(hookCandidates[1] || extracted.ogTitle || extracted.title),
      verbalHook: cleanLine(hookCandidates[2] || ''),
      scriptStructure: 'Platform-native hook first -> immediate value -> CTA aligned to the platform. Preserve platform style before repurposing globally.',
      format: extractor.defaultFormat,
      editComplexity: extractor.defaultEditComplexity,
      actionableValue: cleanLine(extracted.description || hookCandidates.slice(0, 3).join(' '), 220),
      cta: '',
      keywords: [],
      notes: cleanLine(`Auto-collected from ${resolvedPlatform}. Keep this record inside the ${resolvedPlatform} dataset first, then compare for cross-platform themes later.`, 220),
      sourceType: extractor.sourceType(extracted.finalUrl || url),
      collectionMode: 'browser',
      collectorVersion: 'v2',
      engagementCounts: {
        likes: extractNumber(searchableText, extractor.metricKeywords.likes),
        comments: extractNumber(searchableText, extractor.metricKeywords.comments),
        shares: extractNumber(searchableText, extractor.metricKeywords.shares),
        saves: 0,
      },
      publishedAt: extracted.publishedAt || '',
      publishedAtText: cleanLine(
        extracted.publishedAt ||
        hookCandidates.find(line => /\b(today|yesterday|\d+\s+(hour|hr|day|week|month)s?)\b/i.test(line)) ||
        '',
        80
      ),
      platformMetadata: {
        title: extracted.title,
        ogTitle: extracted.ogTitle,
        description: extracted.description,
        author: extracted.author,
        publishedAt: extracted.publishedAt,
        image: extracted.image,
        canonical: extracted.canonical,
        lines: hookCandidates,
      },
    },
    extraction: {
      title: extracted.title,
      ogTitle: extracted.ogTitle,
      description: extracted.description,
      author: extracted.author,
      image: extracted.image,
      canonical: extracted.canonical,
      lines: hookCandidates,
    },
  };
}

async function collectSocialVideoDraft({ url, niche = '', platform = '' }) {
  if (!url) throw new Error('Missing url');
  const extracted = await collectRawPage(url);
  return buildDraftFromExtraction({ url, niche, platform, extracted });
}

function buildVideoLinkMatchers(platform) {
  if (platform === 'instagram') {
    return [/instagram\.com\/(?:reel|p)\//i];
  }
  if (platform === 'tiktok') {
    return [/tiktok\.com\/@[^/]+\/video\//i];
  }
  if (platform === 'youtube') {
    return [/\/shorts\//i, /watch\?v=/i, /youtu\.be\//i];
  }
  if (platform === 'linkedin') {
    return [/linkedin\.com\/posts\//i, /linkedin\.com\/feed\/update\//i];
  }
  return [/./];
}

function isDirectVideoUrl(platform, url = '') {
  return buildVideoLinkMatchers(platform).some(regex => regex.test(url));
}

async function collectCreatorVideoUrls({ url, platform = '', maxVideos = 12 }) {
  const browser = await launchBestBrowser();
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36',
    });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3000);
    for (let i = 0; i < 2; i++) {
      await page.mouse.wheel(0, 1800);
      await page.waitForTimeout(1200);
    }

    const resolvedPlatform = platform || detectPlatform(url);
    const patterns = buildVideoLinkMatchers(resolvedPlatform).map(regex => regex.source);
    const hrefs = await page.evaluate((rawPatterns) => {
      const regexes = rawPatterns.map(pattern => new RegExp(pattern, 'i'));
      const toAbsolute = (href) => {
        try { return new URL(href, location.href).toString(); } catch { return href; }
      };
      return Array.from(document.querySelectorAll('a[href]'))
        .map(node => toAbsolute(node.getAttribute('href')))
        .filter(Boolean)
        .filter(href => regexes.some(regex => regex.test(href)));
    }, patterns);

    return normalizeUrlList(hrefs).slice(0, maxVideos);
  } finally {
    await browser.close();
  }
}

async function collectBatchFromUrls({ urls = [], niche = '', platform = '', platforms = [] }) {
  const uniqueUrls = normalizeUrlList(urls);
  const grouped = createGroupedResult();

  for (const url of uniqueUrls) {
    const detectedPlatform = platform || detectPlatform(url);
    const allowedPlatforms = normalizePlatforms(platforms, platform);
    if (allowedPlatforms.length && !allowedPlatforms.includes(detectedPlatform)) {
      pushGroupedValue(grouped.skippedByPlatform, detectedPlatform, { url, reason: 'platform_not_selected' });
      continue;
    }
    if (!isDirectVideoUrl(detectedPlatform, url)) {
      pushGroupedValue(grouped.skippedByPlatform, detectedPlatform, { url, reason: 'not_direct_video_url' });
      continue;
    }

    try {
      const collected = await collectSocialVideoDraft({ url, niche, platform: detectedPlatform });
      if (!grouped.resultsByPlatform[detectedPlatform]) grouped.resultsByPlatform[detectedPlatform] = { videos: [] };
      grouped.resultsByPlatform[detectedPlatform].videos.push(collected.draft);
    } catch (error) {
      pushGroupedValue(grouped.errorsByPlatform, detectedPlatform, { url, error: error.message || String(error) });
    }
  }

  const videos = Object.values(grouped.resultsByPlatform).flatMap(group => group.videos || []);
  const platformSummary = Object.fromEntries(
    Object.entries(grouped.resultsByPlatform).map(([key, value]) => [key, {
      imported: (value.videos || []).length,
      errors: (grouped.errorsByPlatform[key] || []).length,
      skipped: (grouped.skippedByPlatform[key] || []).length,
    }])
  );

  return {
    videos,
    ...grouped,
    platformSummary,
  };
}

async function collectBatchFromCreator({ url, niche = '', platform = '', maxVideos = 12 }) {
  const resolvedPlatform = platform || detectPlatform(url);
  const urls = await collectCreatorVideoUrls({ url, platform: resolvedPlatform, maxVideos });
  const result = await collectBatchFromUrls({ urls, niche, platform: resolvedPlatform });
  return { ...result, sourceUrls: urls };
}

const raw = process.argv[2];
if (!raw) {
  console.error('Missing JSON payload argument.');
  process.exit(1);
}

try {
  const input = JSON.parse(raw);
  let result;
  if (input.mode === 'urls') {
    result = await collectBatchFromUrls(input);
  } else if (input.mode === 'creator') {
    result = await collectBatchFromCreator(input);
  } else if (input.mode === 'niche') {
    result = await collectBatchFromNiche(input);
  } else {
    result = await collectSocialVideoDraft(input);
  }
  process.stdout.write(JSON.stringify(result));
} catch (error) {
  console.error(error.message || String(error));
  process.exit(1);
}
