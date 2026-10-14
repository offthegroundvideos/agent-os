// lib/os/portfolio/instagramImporter.js
// Reads @madebyotg's recent posts with one ScrapeCreators credit. The profile JSON nests posts in a shape that
// has changed before, so instead of one fixed path we collect every object that looks like a post.

export function extractInstagramPosts(payload, handle) {
  const posts = new Map();
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    const code = node.shortcode ?? node.code;
    const image = node.display_url ?? node.thumbnail_src ?? node.image_versions2?.candidates?.[0]?.url;
    if (typeof code === 'string' && image) {
      // A post node is final: its carousel slides (edge_sidecar_to_children) carry their own shortcodes but are not posts.
      if (posts.has(code)) return;
      const caption = node.edge_media_to_caption?.edges?.[0]?.node?.text
        ?? node.caption?.text ?? (typeof node.caption === 'string' ? node.caption : '');
      const takenAt = node.taken_at_timestamp ?? node.taken_at;
      const isVideo = Boolean(node.is_video || node.video_url || node.media_type === 2 || node.product_type === 'clips');
      posts.set(code, {
        source: 'instagram',
        url: `https://www.instagram.com/p/${code}/`,
        title: caption.split('\n')[0].slice(0, 90) || `@${handle} post`,
        description: caption.slice(0, 500),
        thumbnailUrl: image,
        publishedAt: takenAt ? new Date(takenAt * 1000).toISOString() : '',
        deliverableType: isVideo ? 'reel' : 'photo_set',
      });
      return;
    }
    for (const value of Object.values(node)) visit(value);
  };
  visit(payload);
  return [...posts.values()];
}

export async function importInstagram({ handle, apiKey, budget, settings, fetchImpl = fetch, baseUrl = 'https://api.scrapecreators.com' }) {
  if (!apiKey) return { items: [], skipped: 'SCRAPECREATORS_API_KEY is not set' };
  if (!budget.canUseTool('scrapecreators', 1)) return { items: [], skipped: 'ScrapeCreators daily credit cap reached' };
  let response;
  try {
    response = await fetchImpl(`${baseUrl}/v1/instagram/profile?handle=${encodeURIComponent(handle)}`, {
      headers: { 'x-api-key': apiKey },
      signal: AbortSignal.timeout(25_000),
    });
  } finally {
    // The credit is spent once the request is sent, even if it times out or the network fails.
    budget.record({
      provider: 'scrapecreators', modelOrTool: 'scrapecreators', taskType: 'portfolio_import', units: 1,
      costMicros: settings.get('budget.scrapecreators_credit_micros') ?? 0,
    });
  }
  if (!response.ok) throw new Error(`ScrapeCreators returned ${response.status}`);
  return { items: extractInstagramPosts(await response.json(), handle) };
}
