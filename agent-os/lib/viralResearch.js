import fs from 'fs';
import path from 'path';

const DATA_FILE = path.join(process.cwd(), 'data', 'viral-research.json');

export const SUPPORTED_PLATFORMS = ['instagram', 'tiktok', 'youtube', 'linkedin'];

export const VIDEO_FORMATS = [
  'talking-head',
  'whiteboard',
  'two-person',
  'audio-broll',
  'podcast-cut',
  'screen-recording',
  'voiceover-demo',
  'other',
];

export const EDIT_LEVELS = ['basic', 'medium', 'advanced'];
export const FIVE_X_QUALIFYING_SCORE_MIN = 5;

function ensureDataFile() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({
      creators: [],
      videos: [],
      packets: [],
      lastUpdated: null,
    }, null, 2));
  }
}

function toNumber(value) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean).map(v => String(v).trim()))];
}

function normalizePlatforms(input) {
  const raw = Array.isArray(input)
    ? input
    : String(input || '')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
  return unique(raw.map(item => item.toLowerCase())).filter(platform => SUPPORTED_PLATFORMS.includes(platform));
}

function increment(map, key, amount = 1) {
  if (!key) return;
  map[key] = (map[key] || 0) + amount;
}

function sortCounts(counts, limit = 8, mapper = ([key, count]) => ({ value: key, count })) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .slice(0, limit)
    .map(mapper);
}

function compactText(value = '', max = 140) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function estimateRecencyHours(value = '', isoValue = '') {
  if (isoValue) {
    const publishedMs = new Date(isoValue).getTime();
    if (Number.isFinite(publishedMs)) {
      return Math.max(0, (Date.now() - publishedMs) / 3600000);
    }
  }

  const text = String(value || '').toLowerCase().trim();
  if (!text) return null;
  if (/\btoday\b/.test(text)) return 6;
  if (/\byesterday\b/.test(text)) return 30;

  const hourMatch = text.match(/(\d+)\s*(hour|hr)s?/);
  if (hourMatch) return Number(hourMatch[1]);

  const dayMatch = text.match(/(\d+)\s*day(s)?/);
  if (dayMatch) return Number(dayMatch[1]) * 24;

  const weekMatch = text.match(/(\d+)\s*week(s)?/);
  if (weekMatch) return Number(weekMatch[1]) * 24 * 7;

  const monthMatch = text.match(/(\d+)\s*month(s)?/);
  if (monthMatch) return Number(monthMatch[1]) * 24 * 30;

  return null;
}

function computeFreshnessScore(publishedAtText = '', publishedAt = '') {
  const hours = estimateRecencyHours(publishedAtText, publishedAt);
  if (hours === null) return 0.35;
  if (hours <= 12) return 1;
  if (hours <= 24) return 0.95;
  if (hours <= 72) return 0.88;
  if (hours <= 24 * 7) return 0.76;
  if (hours <= 24 * 14) return 0.62;
  if (hours <= 24 * 30) return 0.45;
  return 0.2;
}

function computeViralVelocityScore(viewCount, fiveXScore, freshnessScore) {
  const safeViews = Math.max(0, toNumber(viewCount));
  const viewSignal = Math.min(1, Math.log10(safeViews + 1) / 7);
  const fiveXSignal = Math.min(1, Math.max(0, Number(fiveXScore || 0)) / 10);
  return Number(((viewSignal * 0.35) + (fiveXSignal * 0.35) + (freshnessScore * 0.3)).toFixed(2));
}

export function loadResearchData() {
  ensureDataFile();
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch {
    return { creators: [], videos: [], packets: [], lastUpdated: null };
  }
}

export function saveResearchData(data) {
  ensureDataFile();
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

export function computeFiveXScore(views, followers) {
  const safeFollowers = Math.max(0, toNumber(followers));
  const safeViews = Math.max(0, toNumber(views));
  if (!safeFollowers) return 0;
  return Number((safeViews / safeFollowers).toFixed(2));
}

function matchesFilters(video, filters = {}) {
  const query = String(filters.query || '').toLowerCase().trim();
  const niche = String(filters.niche || '').toLowerCase().trim();
  const platform = String(filters.platform || '').toLowerCase().trim();
  const platforms = normalizePlatforms(filters.platforms);
  const creator = String(filters.creatorHandle || '').toLowerCase().trim();

  if (niche && String(video.niche || '').toLowerCase() !== niche) return false;
  if (platform && String(video.platform || '').toLowerCase() !== platform) return false;
  if (platforms.length && !platforms.includes(String(video.platform || '').toLowerCase())) return false;
  if (creator && String(video.creatorHandle || '').toLowerCase() !== creator) return false;
  if (!query) return true;

  const haystack = [
    video.creatorName,
    video.creatorHandle,
    video.niche,
    video.platform,
    video.topic,
    video.subject,
    video.url,
    video.visualHook,
    video.writtenHook,
    video.verbalHook,
    video.cta,
    ...(video.keywords || []),
  ].join(' ').toLowerCase();

  return haystack.includes(query);
}

export function normalizeCreator(input = {}) {
  return {
    id: input.id || `creator-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    niche: String(input.niche || '').trim(),
    platform: String(input.platform || '').trim().toLowerCase(),
    creatorName: String(input.creatorName || '').trim(),
    creatorHandle: String(input.creatorHandle || '').replace(/^@/, '').trim(),
    followerCount: toNumber(input.followerCount),
    profileUrl: String(input.profileUrl || '').trim(),
    notes: String(input.notes || '').trim(),
    tags: unique(input.tags),
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeVideo(input = {}) {
  const followerCount = toNumber(input.followerCount);
  const viewCount = toNumber(input.viewCount);
  const fiveXScore = computeFiveXScore(viewCount, followerCount);
  const format = VIDEO_FORMATS.includes(input.format) ? input.format : 'other';
  const editComplexity = EDIT_LEVELS.includes(input.editComplexity) ? input.editComplexity : 'basic';
  const publishedAt = String(input.publishedAt || '').trim();
  const publishedAtText = String(input.publishedAtText || '').trim();
  const freshnessScore = computeFreshnessScore(publishedAtText, publishedAt);
  const viralVelocityScore = computeViralVelocityScore(viewCount, fiveXScore, freshnessScore);

  return {
    id: input.id || `video-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    niche: String(input.niche || '').trim(),
    platform: String(input.platform || '').trim().toLowerCase(),
    creatorName: String(input.creatorName || '').trim(),
    creatorHandle: String(input.creatorHandle || '').replace(/^@/, '').trim(),
    followerCount,
    viewCount,
    fiveXScore,
    qualifiesFiveX: followerCount > 0 ? fiveXScore >= FIVE_X_QUALIFYING_SCORE_MIN : false,
    insufficientFollowerData: followerCount <= 0,
    url: String(input.url || '').trim(),
    topic: String(input.topic || '').trim(),
    subject: String(input.subject || '').trim(),
    visualHook: String(input.visualHook || '').trim(),
    writtenHook: String(input.writtenHook || '').trim(),
    verbalHook: String(input.verbalHook || '').trim(),
    scriptStructure: String(input.scriptStructure || '').trim(),
    format,
    editComplexity,
    editBreakdown: String(input.editBreakdown || '').trim(),
    actionableValue: String(input.actionableValue || '').trim(),
    cta: String(input.cta || '').trim(),
    keywords: unique(input.keywords),
    notes: String(input.notes || '').trim(),
    sourceType: String(input.sourceType || '').trim() || 'video',
    collectionMode: String(input.collectionMode || '').trim() || 'manual',
    collectorVersion: String(input.collectorVersion || '').trim() || 'v2',
    engagementCounts: {
      likes: toNumber(input.engagementCounts?.likes || input.likeCount),
      comments: toNumber(input.engagementCounts?.comments || input.commentCount),
      shares: toNumber(input.engagementCounts?.shares || input.shareCount),
      saves: toNumber(input.engagementCounts?.saves || input.saveCount),
    },
    publishedAt,
    publishedAtText,
    freshnessScore,
    viralVelocityScore,
    platformMetadata: input.platformMetadata && typeof input.platformMetadata === 'object' ? input.platformMetadata : {},
    crawlJobId: String(input.crawlJobId || input.jobId || '').trim(),
    discoveredFrom: String(input.discoveredFrom || input.discovered_from || '').trim(),
    rawArtifactPath: String(input.rawArtifactPath || input.raw_artifact_path || '').trim(),
    crawlTimestamp: String(input.crawlTimestamp || input.crawledAt || '').trim(),
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function addCreator(input) {
  const data = loadResearchData();
  const creator = normalizeCreator(input);
  data.creators = data.creators.filter(existing =>
    !(existing.creatorHandle === creator.creatorHandle &&
      existing.platform === creator.platform &&
      existing.niche === creator.niche)
  );
  data.creators.unshift(creator);
  saveResearchData(data);
  return creator;
}

export function addVideo(input) {
  const data = loadResearchData();
  const video = normalizeVideo(input);
  data.videos.unshift(video);
  saveResearchData(data);
  return video;
}

function isSameImportedVideo(a, b) {
  const urlA = String(a?.url || '').trim();
  const urlB = String(b?.url || '').trim();
  if (urlA && urlB) return urlA === urlB;

  return (
    String(a?.platform || '').trim() === String(b?.platform || '').trim() &&
    String(a?.creatorHandle || '').trim() === String(b?.creatorHandle || '').trim() &&
    String(a?.topic || '').trim() === String(b?.topic || '').trim() &&
    String(a?.publishedAt || '').trim() === String(b?.publishedAt || '').trim()
  );
}

export function upsertImportedVideo(input) {
  const data = loadResearchData();
  const video = normalizeVideo(input);
  const existingIndex = data.videos.findIndex((existing) => isSameImportedVideo(existing, video));

  if (existingIndex >= 0) {
    const existing = data.videos[existingIndex];
    const merged = {
      ...existing,
      ...video,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    data.videos.splice(existingIndex, 1);
    data.videos.unshift(merged);
    saveResearchData(data);
    return { video: merged, created: false };
  }

  data.videos.unshift(video);
  saveResearchData(data);
  return { video, created: true };
}

export function upsertImportedVideos(items = []) {
  const data = loadResearchData();
  const results = [];

  for (const item of items) {
    const video = normalizeVideo(item);
    const existingIndex = data.videos.findIndex((existing) => isSameImportedVideo(existing, video));

    if (existingIndex >= 0) {
      const existing = data.videos[existingIndex];
      const merged = {
        ...existing,
        ...video,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
      };
      data.videos.splice(existingIndex, 1);
      data.videos.unshift(merged);
      results.push({ video: merged, created: false });
      continue;
    }

    data.videos.unshift(video);
    results.push({ video, created: true });
  }

  if (items.length) saveResearchData(data);
  return results;
}

export function bulkImportVideos(items = []) {
  const data = loadResearchData();
  const added = [];
  for (const item of items) {
    const video = normalizeVideo(item);
    data.videos.unshift(video);
    added.push(video);
  }
  saveResearchData(data);
  return added;
}

export function getVideos(filters = {}) {
  const data = loadResearchData();
  let videos = data.videos.filter(video => matchesFilters(video, filters));

  if (filters.qualifiesFiveX === 'true' || filters.qualifiesFiveX === true) {
    videos = videos.filter(video => video.qualifiesFiveX);
  }

  if (filters.freshOnly === 'true' || filters.freshOnly === true) {
    videos = videos.filter(video => Number(video.freshnessScore || 0) >= 0.62);
  }

  return videos.sort((a, b) =>
    (Number(b.viralVelocityScore || 0) - Number(a.viralVelocityScore || 0)) ||
    Number(b.qualifiesFiveX) - Number(a.qualifiesFiveX) ||
    b.fiveXScore - a.fiveXScore ||
    b.viewCount - a.viewCount
  );
}

export function getTopCreators(filters = {}, limit = 20) {
  const videos = getVideos(filters);
  const grouped = new Map();

  for (const video of videos) {
    const key = `${video.platform}:${video.creatorHandle}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        creatorHandle: video.creatorHandle,
        creatorName: video.creatorName,
        platform: video.platform,
        niche: video.niche,
        followerCount: video.followerCount,
        totalVideos: 0,
        qualifyingVideos: 0,
        totalViews: 0,
        avgFiveXScore: 0,
        topFormats: {},
        topTopics: {},
      });
    }

    const entry = grouped.get(key);
    entry.totalVideos += 1;
    entry.totalViews += video.viewCount;
    entry.qualifyingVideos += video.qualifiesFiveX ? 1 : 0;
    entry.avgFiveXScore += video.fiveXScore;
    if (video.format) increment(entry.topFormats, video.format);
    if (video.topic) increment(entry.topTopics, video.topic);
  }

  return [...grouped.values()]
    .map(entry => ({
      ...entry,
      avgFiveXScore: Number((entry.avgFiveXScore / Math.max(1, entry.totalVideos)).toFixed(2)),
      topFormats: Object.entries(entry.topFormats).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([format]) => format),
      topTopics: Object.entries(entry.topTopics).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([topic]) => topic),
    }))
    .sort((a, b) =>
      b.qualifyingVideos - a.qualifyingVideos ||
      b.avgFiveXScore - a.avgFiveXScore ||
      b.totalViews - a.totalViews
    )
    .slice(0, limit);
}

function buildHookFamilies(videos = []) {
  const families = {};
  for (const video of videos) {
    const phrases = [video.visualHook, video.writtenHook, video.verbalHook]
      .map(value => compactText(value, 70))
      .filter(Boolean);
    for (const phrase of phrases) {
      const key = phrase.toLowerCase();
      if (!families[key]) {
        families[key] = { phrase, count: 0, platforms: new Set(), examples: [] };
      }
      families[key].count += 1;
      families[key].platforms.add(video.platform);
      if (families[key].examples.length < 3) {
        families[key].examples.push({
          creatorHandle: video.creatorHandle,
          topic: compactText(video.topic || video.subject, 80),
          platform: video.platform,
        });
      }
    }
  }

  return Object.values(families)
    .map(item => ({
      phrase: item.phrase,
      count: item.count,
      platforms: [...item.platforms],
      examples: item.examples,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

function buildPlatformPacket(platform, filters = {}) {
  const scopedFilters = { ...filters, platform };
  const videos = getVideos(scopedFilters);
  const qualifyingVideos = videos.filter(video => video.qualifiesFiveX);
  const sourceVideos = qualifyingVideos.length ? qualifyingVideos : videos;
  const topicCounts = {};
  const formatCounts = {};
  const ctaCounts = {};
  const negativeTopicCounts = {};
  const negativeFormatCounts = {};
  const topHooks = [];

  for (const video of sourceVideos) {
    increment(topicCounts, video.topic || video.subject);
    increment(formatCounts, video.format);
    increment(ctaCounts, video.cta);
    if (topHooks.length < 12) {
      if (video.visualHook) topHooks.push({ type: 'visual', value: video.visualHook, creatorHandle: video.creatorHandle, fiveXScore: video.fiveXScore });
      if (video.writtenHook) topHooks.push({ type: 'written', value: video.writtenHook, creatorHandle: video.creatorHandle, fiveXScore: video.fiveXScore });
      if (video.verbalHook) topHooks.push({ type: 'verbal', value: video.verbalHook, creatorHandle: video.creatorHandle, fiveXScore: video.fiveXScore });
    }
  }

  for (const video of videos.filter(item => !item.qualifiesFiveX)) {
    increment(negativeTopicCounts, video.topic || video.subject);
    increment(negativeFormatCounts, video.format);
  }

  const topCreators = getTopCreators(scopedFilters, 12);
  const notes = [];
  if (qualifyingVideos.length) {
    const dominantFormat = sortCounts(formatCounts, 1, ([format, count]) => ({ format, count }))[0];
    const dominantTopic = sortCounts(topicCounts, 1, ([topic, count]) => ({ topic, count }))[0];
    if (dominantFormat) notes.push(`${platform} is leaning toward ${dominantFormat.format} formats.`);
    if (dominantTopic) notes.push(`${platform} winners are clustering around "${dominantTopic.topic}".`);
  } else if (videos.length) {
    notes.push(`${platform} has research data, but not enough qualified 5x winners yet.`);
  } else {
    notes.push(`No ${platform} dataset has been collected yet.`);
  }

  return {
    platform,
    platformSummary: {
      platform,
      totalVideos: videos.length,
      qualifyingVideos: qualifyingVideos.length,
      breakoutNowVideos: videos.filter(video => Number(video.freshnessScore || 0) >= 0.88).length,
      totalCreators: topCreators.length,
      avgFiveXScore: videos.length
        ? Number((videos.reduce((sum, video) => sum + video.fiveXScore, 0) / videos.length).toFixed(2))
        : 0,
      avgFreshnessScore: videos.length
        ? Number((videos.reduce((sum, video) => sum + Number(video.freshnessScore || 0), 0) / videos.length).toFixed(2))
        : 0,
      insufficientFollowerData: videos.filter(video => video.insufficientFollowerData).length,
    },
    platformTopCreators: topCreators,
    topQualifyingVideos: qualifyingVideos.slice(0, 12),
    platformWinningTopics: sortCounts(topicCounts, 8, ([topic, count]) => ({ topic, count })),
    platformWinningFormats: sortCounts(formatCounts, 6, ([format, count]) => ({ format, count })),
    platformHookFamilies: buildHookFamilies(sourceVideos),
    platformCTAThemes: sortCounts(ctaCounts, 6, ([cta, count]) => ({ cta, count })),
    platformNegativePatterns: {
      weakTopics: sortCounts(negativeTopicCounts, 5, ([topic, count]) => ({ topic, count })),
      weakFormats: sortCounts(negativeFormatCounts, 5, ([format, count]) => ({ format, count })),
    },
    notes,
  };
}

function buildCrossPlatformSynthesis(platformPackets = []) {
  const topicClusters = {};
  const hookFamilies = {};
  const ctaThemes = {};
  const globalTrendCandidates = [];

  for (const packet of platformPackets) {
    for (const item of packet.platformWinningTopics || []) {
      const key = String(item.topic || '').toLowerCase();
      if (!key) continue;
      if (!topicClusters[key]) {
        topicClusters[key] = { topic: item.topic, totalCount: 0, platforms: new Set(), platformBreakdown: [] };
      }
      topicClusters[key].totalCount += item.count;
      topicClusters[key].platforms.add(packet.platform);
      topicClusters[key].platformBreakdown.push({ platform: packet.platform, count: item.count });
    }

    for (const item of packet.platformHookFamilies || []) {
      const key = String(item.phrase || '').toLowerCase();
      if (!key) continue;
      if (!hookFamilies[key]) {
        hookFamilies[key] = { phrase: item.phrase, totalCount: 0, platforms: new Set(), examples: [] };
      }
      hookFamilies[key].totalCount += item.count;
      for (const platform of item.platforms || [packet.platform]) hookFamilies[key].platforms.add(platform);
      hookFamilies[key].examples.push(...(item.examples || []).slice(0, 2));
    }

    for (const item of packet.platformCTAThemes || []) {
      const key = String(item.cta || '').toLowerCase();
      if (!key) continue;
      if (!ctaThemes[key]) {
        ctaThemes[key] = { cta: item.cta, totalCount: 0, platforms: new Set() };
      }
      ctaThemes[key].totalCount += item.count;
      ctaThemes[key].platforms.add(packet.platform);
    }
  }

  const crossPlatformTopicClusters = Object.values(topicClusters)
    .map(item => ({ ...item, platforms: [...item.platforms] }))
    .filter(item => item.platforms.length > 1)
    .sort((a, b) => b.platforms.length - a.platforms.length || b.totalCount - a.totalCount)
    .slice(0, 10);

  const crossPlatformHookFamilies = Object.values(hookFamilies)
    .map(item => ({ ...item, platforms: [...item.platforms], examples: item.examples.slice(0, 4) }))
    .filter(item => item.platforms.length > 1)
    .sort((a, b) => b.platforms.length - a.platforms.length || b.totalCount - a.totalCount)
    .slice(0, 10);

  const crossPlatformCTAThemes = Object.values(ctaThemes)
    .map(item => ({ ...item, platforms: [...item.platforms] }))
    .filter(item => item.platforms.length > 1)
    .sort((a, b) => b.platforms.length - a.platforms.length || b.totalCount - a.totalCount)
    .slice(0, 8);

  for (const topic of crossPlatformTopicClusters.slice(0, 6)) {
    globalTrendCandidates.push({
      trend: topic.topic,
      overlapStrength: topic.platforms.length >= 3 ? 'strong' : 'moderate',
      platforms: topic.platforms,
      expression: topic.platformBreakdown,
    });
  }

  return {
    crossPlatformThemes: globalTrendCandidates,
    crossPlatformTopicClusters,
    crossPlatformHookFamilies,
    crossPlatformCTAThemes,
    globalTrendCandidates,
  };
}

export function buildPacket(filters = {}) {
  const requestedPlatforms = normalizePlatforms(filters.platforms);
  const platforms = requestedPlatforms.length
    ? requestedPlatforms
    : (filters.platform ? [filters.platform] : SUPPORTED_PLATFORMS.filter(platform =>
        getVideos({ ...filters, platform }).length > 0
      ));
  const fallbackPlatforms = platforms.length ? platforms : SUPPORTED_PLATFORMS;
  const platformPackets = fallbackPlatforms.map(platform => buildPlatformPacket(platform, filters));
  const crossPlatformSynthesis = buildCrossPlatformSynthesis(platformPackets);
  const allVideos = getVideos(filters);

  return {
    niche: filters.niche || '',
    platform: filters.platform || '',
    platforms: fallbackPlatforms,
    totalVideos: allVideos.length,
    qualifyingVideos: allVideos.filter(video => video.qualifiesFiveX).length,
    platformPackets,
    crossPlatformSynthesis,
    generatedAt: new Date().toISOString(),
  };
}

export function getResearchSummary(filters = {}) {
  const data = loadResearchData();
  const packet = buildPacket(filters);
  const allVideos = getVideos(filters);

  return {
    niche: filters.niche || '',
    platform: filters.platform || '',
    platforms: packet.platforms,
    totalVideos: allVideos.length,
    qualifyingVideos: allVideos.filter(video => video.qualifiesFiveX).length,
    breakoutNowVideos: allVideos.filter(video => Number(video.freshnessScore || 0) >= 0.88).length,
    totalCreators: getTopCreators(filters, 100).length,
    avgFiveXScore: allVideos.length
      ? Number((allVideos.reduce((sum, video) => sum + video.fiveXScore, 0) / allVideos.length).toFixed(2))
      : 0,
    avgFreshnessScore: allVideos.length
      ? Number((allVideos.reduce((sum, video) => sum + Number(video.freshnessScore || 0), 0) / allVideos.length).toFixed(2))
      : 0,
    platformSummaries: packet.platformPackets.map(item => item.platformSummary),
    crossPlatformSynthesis: packet.crossPlatformSynthesis,
    lastUpdated: data.lastUpdated,
  };
}

export function getResearchContextForTopic(topic, filters = {}) {
  const query = slugify(topic).replace(/-/g, ' ');
  const packet = buildPacket({ ...filters, query });
  if (!packet.totalVideos) return '';

  const platformSections = packet.platformPackets
    .filter(item => item.platformSummary.totalVideos > 0)
    .map(item => {
      const topCreators = item.platformTopCreators
        .slice(0, 4)
        .map(creator => `${creator.creatorHandle} - ${creator.qualifyingVideos} qualifying videos, avg ${creator.avgFiveXScore}x`)
        .join('\n');
      const topVideos = item.topQualifyingVideos
        .slice(0, 4)
        .map(video =>
          `- ${video.creatorHandle}: ${video.topic || video.subject || 'Untitled'} | ${video.viewCount} views | ${video.fiveXScore}x | freshness=${video.freshnessScore} | ${video.publishedAtText || 'date unknown'} | ${video.format} | visual="${compactText(video.visualHook, 60)}" | written="${compactText(video.writtenHook, 60)}" | verbal="${compactText(video.verbalHook, 60)}"`
        ).join('\n');
      const winningFormats = item.platformWinningFormats.slice(0, 4).map(entry => `${entry.format} (${entry.count})`).join(', ');
      const winningTopics = item.platformWinningTopics.slice(0, 4).map(entry => `${entry.topic} (${entry.count})`).join(', ');
      return [
        `[${item.platform.toUpperCase()} RESEARCH]`,
        `Videos: ${item.platformSummary.totalVideos}`,
        `Qualifying 5x videos: ${item.platformSummary.qualifyingVideos}`,
        `Current breakout videos: ${item.platformSummary.breakoutNowVideos}`,
        `Top creators:\n${topCreators || 'None yet'}`,
        `Winning formats: ${winningFormats || 'None yet'}`,
        `Winning topics: ${winningTopics || 'None yet'}`,
        `What is working on ${item.platform}: ${(item.notes || []).join(' ')}`,
        `Top qualifying videos:\n${topVideos || 'None yet'}`,
        `[END ${item.platform.toUpperCase()} RESEARCH]`,
      ].join('\n');
    }).join('\n\n');

  const crossThemes = packet.crossPlatformSynthesis.globalTrendCandidates
    .slice(0, 5)
    .map(item => `${item.trend} | overlap=${item.overlapStrength} | platforms=${item.platforms.join(', ')}`)
    .join('\n');
  const portableHooks = packet.crossPlatformSynthesis.crossPlatformHookFamilies
    .slice(0, 5)
    .map(item => `${item.phrase} | platforms=${item.platforms.join(', ')}`)
    .join('\n');

  return [
    '[PLATFORM-SEPARATED VIRAL RESEARCH CONTEXT]',
    platformSections,
    '[CROSS-PLATFORM THEMES]',
    `Global trend candidates:\n${crossThemes || 'None yet'}`,
    `Portable hook families:\n${portableHooks || 'None yet'}`,
    'Distinguish what is platform-native from what is portable across platforms. Adapt instead of copying blindly.',
    '[END PLATFORM-SEPARATED VIRAL RESEARCH CONTEXT]',
  ].filter(Boolean).join('\n\n');
}

export function getViralSystemAddendum(agentId) {
  const base = 'VIRAL CONTENT OPERATING SYSTEM: Use the 5X rule. A video only qualifies if views are at least 5 times the creator follower count when follower data is visible. Example: 50k followers needs 250k views. Track top creators, analyze visual hooks, written hooks, verbal hooks, format, edit complexity, and how the value is delivered. Keep platform-native datasets separate first, then synthesize cross-platform themes second.';

  if (agentId === 'alex') {
    return `${base} Research per platform first. Explain what is specifically working on TikTok, YouTube, LinkedIn, and Instagram separately, then identify cross-platform themes that appear across multiple platforms. Distinguish platform-native patterns from portable patterns.`;
  }

  return `${base} If research context includes multiple platforms, preserve platform differences before borrowing themes globally.`;
}
