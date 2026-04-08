import { emitEvent } from './eventLog.js';
import { loadPublishRuntime } from './publishRuntime.js';

const PLATFORM_RULES = {
  instagram: {
    label: 'Instagram Reels',
    maxCaptionLength: 2200,
    supportsHashtags: true,
    requiresMediaContainer: true,
  },
  tiktok: {
    label: 'TikTok',
    maxCaptionLength: 2200,
    supportsHashtags: true,
    requiresMediaContainer: false,
  },
  youtube: {
    label: 'YouTube Shorts',
    maxCaptionLength: 5000,
    supportsHashtags: true,
    requiresMediaContainer: false,
  },
  linkedin: {
    label: 'LinkedIn',
    maxCaptionLength: 3000,
    supportsHashtags: true,
    requiresMediaContainer: false,
  },
  facebook: {
    label: 'Facebook Reels',
    maxCaptionLength: 2200,
    supportsHashtags: true,
    requiresMediaContainer: true,
  },
  x: {
    label: 'X',
    maxCaptionLength: 280,
    supportsHashtags: true,
    requiresMediaContainer: false,
  },
};

const PUBLISH_ENV_KEYS = {
  instagram: ['INSTAGRAM_ACCESS_TOKEN', 'INSTAGRAM_IG_USER_ID'],
  facebook: ['FACEBOOK_PAGE_ACCESS_TOKEN', 'FACEBOOK_PAGE_ID'],
  tiktok: ['TIKTOK_ACCESS_TOKEN', 'TIKTOK_OPEN_ID'],
  youtube: ['YOUTUBE_ACCESS_TOKEN', 'YOUTUBE_CHANNEL_ID'],
  linkedin: ['LINKEDIN_ACCESS_TOKEN', 'LINKEDIN_AUTHOR_URN'],
  x: ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_TOKEN_SECRET'],
};

function getRule(platform = 'instagram') {
  return PLATFORM_RULES[String(platform || 'instagram').toLowerCase()] || PLATFORM_RULES.instagram;
}

function getEnv(...keys) {
  for (const key of keys) {
    if (process.env[key]) return String(process.env[key]).trim();
  }
  return '';
}

function sanitizeHeaderValue(value, fallback = '') {
  return String(value || fallback).trim();
}

function sanitizeText(value, maxLength) {
  const text = String(value || '').replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…` : text;
}

function extractTags(caption = '') {
  const tags = Array.from(new Set((String(caption).match(/#[\p{L}\p{N}_]+/gu) || []).map((tag) => tag.toLowerCase())));
  return tags.slice(0, 15);
}

function buildInstagramPayload(job = {}, context = {}) {
  const caption = sanitizeText(job.caption, getRule('instagram').maxCaptionLength);
  const hashtags = extractTags(caption);
  return {
    media_type: 'REELS',
    caption,
    hashtags,
    cover_frame_hint: context.calendarEntry?.hook_text || context.calendarEntry?.title || '',
    landing_page_id: job.landing_page_id,
    cta_id: job.cta_id,
  };
}

function buildTikTokPayload(job = {}, context = {}) {
  const caption = sanitizeText(job.caption, getRule('tiktok').maxCaptionLength);
  return {
    post_mode: 'short_video',
    caption,
    hashtags: extractTags(caption),
    privacy_level: 'PUBLIC_TO_EVERYONE',
    cta_id: job.cta_id,
    hook_text: context.calendarEntry?.hook_text || '',
  };
}

function buildYouTubePayload(job = {}, context = {}) {
  const titleSource = context.calendarEntry?.title || context.calendarEntry?.hook_text || 'Short-form content';
  const title = sanitizeText(titleSource, 90);
  const description = sanitizeText(job.caption, getRule('youtube').maxCaptionLength);
  return {
    title,
    description,
    tags: extractTags(description),
    category: '22',
    privacy_status: 'public',
    is_short: true,
    cta_id: job.cta_id,
  };
}

function buildLinkedInPayload(job = {}, context = {}) {
  const commentary = sanitizeText(job.caption, getRule('linkedin').maxCaptionLength);
  return {
    commentary,
    hashtags: extractTags(commentary),
    landing_page_id: job.landing_page_id,
    cta_id: job.cta_id,
    audience: context.calendarEntry?.journey_stage || 'professional',
  };
}

function buildFacebookPayload(job = {}, context = {}) {
  const caption = sanitizeText(job.caption, getRule('facebook').maxCaptionLength);
  return {
    media_type: 'REELS',
    description: caption,
    hashtags: extractTags(caption),
    cta_id: job.cta_id,
    hook_text: context.calendarEntry?.hook_text || '',
  };
}

function buildXPayload(job = {}, context = {}) {
  const commentary = sanitizeText(job.caption, getRule('x').maxCaptionLength);
  return {
    text: commentary,
    hashtags: extractTags(commentary),
    cta_id: job.cta_id,
    hook_text: context.calendarEntry?.hook_text || '',
  };
}

function resolveMediaUrl(job = {}, context = {}) {
  return (
    String(job.media_url || job.mediaUrl || '').trim() ||
    String(job.render_url || '').trim() ||
    String(context.renderJob?.public_media_url || '').trim() ||
    String(context.renderJob?.media_url || '').trim() ||
    String(context.renderJob?.output_url || '').trim() ||
    String(context.renderJob?.output_urls?.[String(job.platform || '').toLowerCase()] || '').trim()
  );
}

function isPubliclyReachableUrl(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return false;
  try {
    const url = new URL(raw);
    const host = String(url.hostname || '').toLowerCase();
    if (!host) return false;
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') return false;
    if (host.startsWith('192.168.') || host.startsWith('10.') || host.endsWith('.local')) return false;
    if (host.startsWith('172.')) {
      const second = Number(host.split('.')[1] || 0);
      if (second >= 16 && second <= 31) return false;
    }
    return /^https?:$/i.test(url.protocol);
  } catch {
    return false;
  }
}

function getAdapterRequirements(platform, job = {}, context = {}) {
  const mediaUrl = resolveMediaUrl(job, context);
  const mediaUrlPublic = isPubliclyReachableUrl(mediaUrl);

  if (platform === 'instagram') {
    const accessToken = getEnv('INSTAGRAM_ACCESS_TOKEN', 'META_ACCESS_TOKEN');
    const igUserId = getEnv('INSTAGRAM_IG_USER_ID', 'META_IG_USER_ID');
    return {
      configured: !!(accessToken && igUserId && mediaUrl && mediaUrlPublic),
      missing: [
        ...(accessToken ? [] : ['INSTAGRAM_ACCESS_TOKEN']),
        ...(igUserId ? [] : ['INSTAGRAM_IG_USER_ID']),
        ...(mediaUrl ? [] : ['media_url']),
        ...(mediaUrl && !mediaUrlPublic ? ['public_media_url'] : []),
      ],
      media_url: mediaUrl,
      media_url_public: mediaUrlPublic,
    };
  }
  if (platform === 'facebook') {
    const accessToken = getEnv('FACEBOOK_PAGE_ACCESS_TOKEN', 'META_PAGE_ACCESS_TOKEN');
    const pageId = getEnv('FACEBOOK_PAGE_ID', 'META_PAGE_ID');
    return {
      configured: !!(accessToken && pageId && mediaUrl && mediaUrlPublic),
      missing: [
        ...(accessToken ? [] : ['FACEBOOK_PAGE_ACCESS_TOKEN']),
        ...(pageId ? [] : ['FACEBOOK_PAGE_ID']),
        ...(mediaUrl ? [] : ['media_url']),
        ...(mediaUrl && !mediaUrlPublic ? ['public_media_url'] : []),
      ],
      media_url: mediaUrl,
      media_url_public: mediaUrlPublic,
    };
  }
  if (platform === 'tiktok') {
    const accessToken = getEnv('TIKTOK_ACCESS_TOKEN');
    const openId = getEnv('TIKTOK_OPEN_ID');
    return {
      configured: !!(accessToken && openId && mediaUrl && mediaUrlPublic),
      missing: [
        ...(accessToken ? [] : ['TIKTOK_ACCESS_TOKEN']),
        ...(openId ? [] : ['TIKTOK_OPEN_ID']),
        ...(mediaUrl ? [] : ['media_url']),
        ...(mediaUrl && !mediaUrlPublic ? ['public_media_url'] : []),
      ],
      media_url: mediaUrl,
      media_url_public: mediaUrlPublic,
    };
  }
  if (platform === 'youtube') {
    const accessToken = getEnv('YOUTUBE_ACCESS_TOKEN');
    const channelId = getEnv('YOUTUBE_CHANNEL_ID');
    return {
      configured: !!(accessToken && channelId && mediaUrl && mediaUrlPublic),
      missing: [
        ...(accessToken ? [] : ['YOUTUBE_ACCESS_TOKEN']),
        ...(channelId ? [] : ['YOUTUBE_CHANNEL_ID']),
        ...(mediaUrl ? [] : ['media_url']),
        ...(mediaUrl && !mediaUrlPublic ? ['public_media_url'] : []),
      ],
      media_url: mediaUrl,
      media_url_public: mediaUrlPublic,
    };
  }
  if (platform === 'linkedin') {
    const accessToken = getEnv('LINKEDIN_ACCESS_TOKEN');
    const authorUrn = getEnv('LINKEDIN_AUTHOR_URN');
    return {
      configured: !!(accessToken && authorUrn && mediaUrl && mediaUrlPublic),
      missing: [
        ...(accessToken ? [] : ['LINKEDIN_ACCESS_TOKEN']),
        ...(authorUrn ? [] : ['LINKEDIN_AUTHOR_URN']),
        ...(mediaUrl ? [] : ['media_url']),
        ...(mediaUrl && !mediaUrlPublic ? ['public_media_url'] : []),
      ],
      media_url: mediaUrl,
      media_url_public: mediaUrlPublic,
    };
  }
  if (platform === 'x') {
    const apiKey = getEnv('X_API_KEY');
    const apiSecret = getEnv('X_API_SECRET');
    const accessToken = getEnv('X_ACCESS_TOKEN');
    const accessTokenSecret = getEnv('X_ACCESS_TOKEN_SECRET');
    return {
      configured: !!(apiKey && apiSecret && accessToken && accessTokenSecret && mediaUrl && mediaUrlPublic),
      missing: [
        ...(apiKey ? [] : ['X_API_KEY']),
        ...(apiSecret ? [] : ['X_API_SECRET']),
        ...(accessToken ? [] : ['X_ACCESS_TOKEN']),
        ...(accessTokenSecret ? [] : ['X_ACCESS_TOKEN_SECRET']),
        ...(mediaUrl ? [] : ['media_url']),
        ...(mediaUrl && !mediaUrlPublic ? ['public_media_url'] : []),
      ],
      media_url: mediaUrl,
      media_url_public: mediaUrlPublic,
    };
  }
  return { configured: false, missing: [`${platform}_adapter_not_implemented`], media_url: mediaUrl, media_url_public: mediaUrlPublic };
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    const message = data?.error?.message || data?.message || `${response.status} ${response.statusText}`;
    throw new Error(message);
  }
  return data;
}

export async function testInstagramConnection() {
  const accessToken = getEnv('INSTAGRAM_ACCESS_TOKEN', 'META_ACCESS_TOKEN');
  const igUserId = getEnv('INSTAGRAM_IG_USER_ID', 'META_IG_USER_ID');
  const apiVersion = getEnv('INSTAGRAM_GRAPH_API_VERSION') || 'v23.0';
  const graphBase = getEnv('INSTAGRAM_GRAPH_BASE_URL') || 'https://graph.facebook.com';

  if (!accessToken || !igUserId) {
    return {
      ok: false,
      missing: [
        ...(accessToken ? [] : ['INSTAGRAM_ACCESS_TOKEN']),
        ...(igUserId ? [] : ['INSTAGRAM_IG_USER_ID']),
      ],
      message: 'Instagram connection is missing required credentials.',
    };
  }

  try {
    const profile = await fetchJson(
      `${graphBase}/${apiVersion}/${igUserId}?fields=id,username,account_type&access_token=${encodeURIComponent(accessToken)}`
    );
    return {
      ok: true,
      missing: [],
      profile: {
        id: String(profile.id || '').trim(),
        username: String(profile.username || '').trim(),
        account_type: String(profile.account_type || '').trim(),
      },
      message: 'Instagram credentials are valid and the account is reachable.',
    };
  } catch (error) {
    return {
      ok: false,
      missing: [],
      error: error.message,
      message: 'Instagram credentials did not pass the profile lookup test.',
    };
  }
}

export async function testYouTubeConnection() {
  const accessToken = getEnv('YOUTUBE_ACCESS_TOKEN');
  const channelId = getEnv('YOUTUBE_CHANNEL_ID');

  if (!accessToken || !channelId) {
    return {
      ok: false,
      missing: [
        ...(accessToken ? [] : ['YOUTUBE_ACCESS_TOKEN']),
        ...(channelId ? [] : ['YOUTUBE_CHANNEL_ID']),
      ],
      message: 'YouTube connection is missing required credentials.',
    };
  }

  try {
    const profile = await fetchJson(
      `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${encodeURIComponent(channelId)}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      }
    );
    const item = Array.isArray(profile.items) ? profile.items[0] : null;
    if (!item?.id) {
      return {
        ok: false,
        missing: [],
        message: 'YouTube credentials are valid, but the configured channel was not returned.',
      };
    }
    return {
      ok: true,
      missing: [],
      profile: {
        id: String(item.id || '').trim(),
        title: String(item?.snippet?.title || '').trim(),
        customUrl: String(item?.snippet?.customUrl || '').trim(),
      },
      message: 'YouTube credentials are valid and the channel is reachable.',
    };
  } catch (error) {
    return {
      ok: false,
      missing: [],
      error: error.message,
      message: 'YouTube credentials did not pass the channel lookup test.',
    };
  }
}

export function buildPlatformPayload(job = {}, context = {}) {
  const platform = String(job.platform || 'instagram').toLowerCase();
  if (platform === 'facebook') return buildFacebookPayload(job, context);
  if (platform === 'tiktok') return buildTikTokPayload(job, context);
  if (platform === 'youtube') return buildYouTubePayload(job, context);
  if (platform === 'linkedin') return buildLinkedInPayload(job, context);
  if (platform === 'x') return buildXPayload(job, context);
  return buildInstagramPayload(job, context);
}

function getAdapterMode(platform = 'instagram') {
  const runtime = loadPublishRuntime();
  const key = `PUBLISH_${String(platform).toUpperCase()}_MODE`;
  const runtimeOverrideMap = {
    instagram: runtime.instagramMode,
    facebook: runtime.facebookMode,
    tiktok: runtime.tiktokMode,
    youtube: runtime.youtubeMode,
    linkedin: runtime.linkedinMode,
    x: runtime.xMode,
  };
  const runtimeOverride = runtimeOverrideMap[platform] || '';
  const requested = String(runtimeOverride || process.env[key] || process.env.PUBLISH_MODE || 'simulate').trim().toLowerCase();
  return requested === 'api' ? 'api' : 'simulate';
}

export function listPublishingPlatforms() {
  return Object.keys(PLATFORM_RULES);
}

function summarizeMediaReadiness(job = {}, requirements = {}) {
  return {
    present: !!requirements.media_url,
    media_url: requirements.media_url || '',
    publicly_reachable: !!requirements.media_url_public,
    source: requirements.media_url
      ? job.media_url
        ? 'publish_job'
        : job.render_job_id
        ? 'render_job'
        : 'resolved'
      : 'missing',
  };
}

export function getPublishingIntegrationStatus(jobs = []) {
  const normalizedJobs = Array.isArray(jobs) ? jobs : [];
  const runtime = loadPublishRuntime();
  const byPlatform = listPublishingPlatforms().map((platform) => {
    const platformJobs = normalizedJobs.filter((job) => String(job.platform || '').toLowerCase() === platform);
    const latestJob = platformJobs[0] || null;
    const requirements = getAdapterRequirements(platform, latestJob || {}, {});
    const envKeys = PUBLISH_ENV_KEYS[platform] || [];
    const configuredEnvKeys = envKeys.filter((key) => !!getEnv(key));
    const missingEnvKeys = envKeys.filter((key) => !getEnv(key));
    const mode = getAdapterMode(platform);
    const liveReady = mode === 'api' ? requirements.configured : false;

    return {
      platform,
      platform_label: getRule(platform).label,
      adapter_mode: mode,
      live_ready: liveReady,
      adapter_implemented: platform === 'instagram' || platform === 'youtube',
      env_keys: envKeys,
      configured_env_keys: configuredEnvKeys,
      missing_env_keys: missingEnvKeys,
      media: summarizeMediaReadiness(latestJob || {}, requirements),
      requirements,
      latest_job: latestJob
        ? {
            id: latestJob.id,
            publish_status: latestJob.publish_status,
            scheduled_for: latestJob.scheduled_for,
            published_at: latestJob.published_at,
            platform_post_id: latestJob.platform_post_id,
            post_url: latestJob.post_url,
            attempts: Number(latestJob.attempts || 0),
            last_error_at: latestJob.last_error_at || '',
            error: latestJob.error || '',
          }
        : null,
      next_step:
        mode !== 'api'
          ? 'Switch adapter mode to api after credentials and media hosting are ready.'
          : !requirements.media_url
          ? 'Provide a public media_url from the render pipeline.'
          : requirements.media_url_public === false
          ? 'Set PUBLIC_MEDIA_BASE_URL to a publicly reachable host instead of localhost.'
          : missingEnvKeys.length
          ? `Add ${missingEnvKeys.join(', ')} to .env.local.`
          : platform !== 'instagram'
          ? 'Implement the live platform adapter before enabling API mode.'
          : 'Ready for a live publish test.',
    };
  });

  const liveReadyCount = byPlatform.filter((item) => item.live_ready).length;
  const simulateCount = byPlatform.filter((item) => item.adapter_mode === 'simulate').length;
  const failingJobs = normalizedJobs.filter((job) => job.publish_status === 'failed').slice(0, 5);

  return {
    summary: {
      total_platforms: byPlatform.length,
      live_ready_platforms: liveReadyCount,
      simulate_platforms: simulateCount,
      latest_job_count: normalizedJobs.length,
      failed_jobs: failingJobs.length,
    },
    runtime,
    failing_jobs: failingJobs,
    platforms: byPlatform,
  };
}

async function simulatePublish(job, payload) {
  return {
    adapter: 'simulate',
    method: 'simulate',
    platform_post_id: `${job.platform}-${Date.now()}`,
    post_url: `https://example.com/${job.platform}/${Date.now()}`,
    platform_payload: payload,
    published_at: new Date().toISOString(),
  };
}

async function publishInstagramViaApi(job, payload, context = {}) {
  const accessToken = getEnv('INSTAGRAM_ACCESS_TOKEN', 'META_ACCESS_TOKEN');
  const igUserId = getEnv('INSTAGRAM_IG_USER_ID', 'META_IG_USER_ID');
  const apiVersion = getEnv('INSTAGRAM_GRAPH_API_VERSION') || 'v23.0';
  const graphBase = getEnv('INSTAGRAM_GRAPH_BASE_URL') || 'https://graph.facebook.com';
  const mediaUrl = resolveMediaUrl(job, context);

  if (!accessToken) throw new Error('Instagram publishing is missing INSTAGRAM_ACCESS_TOKEN');
  if (!igUserId) throw new Error('Instagram publishing is missing INSTAGRAM_IG_USER_ID');
  if (!mediaUrl) throw new Error('Instagram publishing needs a public media_url on the publish job or render output');

  const createParams = new URLSearchParams({
    media_type: 'REELS',
    video_url: mediaUrl,
    caption: payload.caption || '',
    access_token: accessToken,
  });

  const container = await fetchJson(`${graphBase}/${apiVersion}/${igUserId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: createParams.toString(),
  });

  const creationId = container.id;
  if (!creationId) throw new Error('Instagram container creation did not return an id');

  let statusCode = 'IN_PROGRESS';
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const status = await fetchJson(
      `${graphBase}/${apiVersion}/${creationId}?fields=status_code,status&access_token=${encodeURIComponent(accessToken)}`
    );
    statusCode = String(status.status_code || status.status || '').toUpperCase();
    if (statusCode === 'FINISHED' || statusCode === 'PUBLISHED') break;
    if (statusCode === 'ERROR' || statusCode === 'EXPIRED') {
      throw new Error(`Instagram media container failed with status ${statusCode}`);
    }
    await sleep(5000);
  }

  if (statusCode !== 'FINISHED' && statusCode !== 'PUBLISHED') {
    throw new Error(`Instagram media container did not finish in time (last status: ${statusCode || 'UNKNOWN'})`);
  }

  const published = await fetchJson(`${graphBase}/${apiVersion}/${igUserId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      creation_id: creationId,
      access_token: accessToken,
    }).toString(),
  });

  const mediaId = published.id;
  if (!mediaId) throw new Error('Instagram publish did not return a media id');

  let permalink = '';
  try {
    const details = await fetchJson(
      `${graphBase}/${apiVersion}/${mediaId}?fields=id,permalink&access_token=${encodeURIComponent(accessToken)}`
    );
    permalink = String(details.permalink || '').trim();
  } catch {}

  return {
    adapter: 'instagram_graph_api',
    method: 'api',
    platform_post_id: mediaId,
    post_url: permalink,
    platform_payload: {
      ...payload,
      video_url: mediaUrl,
      creation_id: creationId,
    },
    published_at: new Date().toISOString(),
  };
}

async function resolveMediaForUpload(job = {}, context = {}) {
  const mediaUrl = resolveMediaUrl(job, context);
  if (!mediaUrl) throw new Error('Publishing needs a media_url on the publish job or render output');

  const mediaResponse = await fetch(mediaUrl);
  if (!mediaResponse.ok) {
    throw new Error(`Unable to fetch media for upload (${mediaResponse.status} ${mediaResponse.statusText})`);
  }

  const contentType = sanitizeHeaderValue(mediaResponse.headers.get('content-type'), 'video/mp4');
  const contentLength = Number(mediaResponse.headers.get('content-length') || 0);
  const buffer = Buffer.from(await mediaResponse.arrayBuffer());

  return {
    mediaUrl,
    contentType,
    contentLength: contentLength || buffer.length,
    buffer,
  };
}

async function publishYouTubeViaApi(job, payload, context = {}) {
  const accessToken = getEnv('YOUTUBE_ACCESS_TOKEN');
  const channelId = getEnv('YOUTUBE_CHANNEL_ID');
  if (!accessToken) throw new Error('YouTube publishing is missing YOUTUBE_ACCESS_TOKEN');
  if (!channelId) throw new Error('YouTube publishing is missing YOUTUBE_CHANNEL_ID');

  const media = await resolveMediaForUpload(job, context);
  const uploadMetadata = {
    snippet: {
      title: payload.title || 'Short-form content',
      description: payload.description || '',
      tags: Array.isArray(payload.tags) ? payload.tags : [],
      categoryId: String(payload.category || '22'),
    },
    status: {
      privacyStatus: String(payload.privacy_status || 'public'),
      selfDeclaredMadeForKids: false,
    },
  };

  const initiateResponse = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': String(media.contentLength),
        'X-Upload-Content-Type': media.contentType,
      },
      body: JSON.stringify(uploadMetadata),
    }
  );

  if (!initiateResponse.ok) {
    const message = await initiateResponse.text().catch(() => '');
    throw new Error(message || `YouTube resumable session creation failed (${initiateResponse.status})`);
  }

  const uploadUrl = sanitizeHeaderValue(initiateResponse.headers.get('location'));
  if (!uploadUrl) throw new Error('YouTube resumable session did not return an upload URL');

  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Length': String(media.contentLength),
      'Content-Type': media.contentType,
    },
    body: media.buffer,
  });

  const uploadText = await uploadResponse.text().catch(() => '');
  let uploadJson = {};
  try {
    uploadJson = uploadText ? JSON.parse(uploadText) : {};
  } catch {
    uploadJson = { raw: uploadText };
  }

  if (!uploadResponse.ok) {
    const message = uploadJson?.error?.message || uploadJson?.message || uploadText || `YouTube upload failed (${uploadResponse.status})`;
    throw new Error(message);
  }

  const videoId = String(uploadJson.id || '').trim();
  if (!videoId) throw new Error('YouTube upload did not return a video id');

  return {
    adapter: 'youtube_data_api',
    method: 'api',
    platform_post_id: videoId,
    post_url: `https://www.youtube.com/shorts/${videoId}`,
    platform_payload: {
      ...payload,
      channel_id: channelId,
      media_url: media.mediaUrl,
      uploaded_content_type: media.contentType,
    },
    published_at: new Date().toISOString(),
  };
}

async function publishViaApi(platform, job, payload, context = {}) {
  if (platform === 'instagram') {
    return publishInstagramViaApi(job, payload, context);
  }
  if (platform === 'youtube') {
    return publishYouTubeViaApi(job, payload, context);
  }
  throw new Error(`${platform} API publishing is not configured yet`);
}

export async function publishWithGateway(job = {}, context = {}) {
  const platform = String(job.platform || 'instagram').toLowerCase();
  const payload = buildPlatformPayload(job, context);
  const mode = getAdapterMode(platform);
  const requirements = getAdapterRequirements(platform, job, context);

  try {
    const result =
      mode === 'api'
        ? await publishViaApi(platform, job, payload, context)
        : await simulatePublish(job, payload);

    emitEvent(
      'post.published',
      'published_post',
      job.id || job.asset_id || job.calendar_entry_id || platform,
      {
        platform,
        adapter: result.adapter,
        publish_method: result.method,
        calendar_entry_id: job.calendar_entry_id,
        asset_id: job.asset_id,
      },
      { source_system: 'publishing_gateway' }
    );

    return {
      ...result,
      adapter_mode: mode,
      platform_payload: result.platform_payload || payload,
      requirements,
    };
  } catch (error) {
    emitEvent(
      'post.publish_failed',
      'published_post',
      job.id || job.asset_id || job.calendar_entry_id || platform,
      {
        platform,
        error: error.message,
        calendar_entry_id: job.calendar_entry_id,
        asset_id: job.asset_id,
      },
      { source_system: 'publishing_gateway' }
    );
    throw error;
  }
}

export function getPublishingGatewaySummary(job = {}, context = {}) {
  const platform = String(job.platform || 'instagram').toLowerCase();
  const rule = getRule(platform);
  const requirements = getAdapterRequirements(platform, job, context);
  return {
    platform,
    platform_label: rule.label,
    adapter_mode: getAdapterMode(platform),
    payload: buildPlatformPayload(job, context),
    requirements,
  };
}
