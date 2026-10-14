// tests/osPortfolioInstagram.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractInstagramPosts, importInstagram } from '../lib/os/portfolio/instagramImporter.js';

const PROFILE = {
  data: {
    user: {
      edge_owner_to_timeline_media: {
        edges: [
          { node: { shortcode: 'ABC', display_url: 'https://cdn/abc.jpg', is_video: true, taken_at_timestamp: 1767225600,
            edge_media_to_caption: { edges: [{ node: { text: 'Sunset sail off Bora Bora\nshot for a charter client' } }] } } },
          { node: { shortcode: 'DEF', display_url: 'https://cdn/def.jpg', is_video: false, taken_at_timestamp: 1767312000, edge_media_to_caption: { edges: [] } } },
          { node: { shortcode: 'ABC', display_url: 'https://cdn/abc.jpg' } },
        ],
      },
    },
  },
};

test('posts are found anywhere in the payload and de-duplicated', () => {
  const posts = extractInstagramPosts(PROFILE, 'madebyotg');
  assert.equal(posts.length, 2);
  assert.deepEqual(posts[0], {
    source: 'instagram',
    url: 'https://www.instagram.com/p/ABC/',
    title: 'Sunset sail off Bora Bora',
    description: 'Sunset sail off Bora Bora\nshot for a charter client',
    thumbnailUrl: 'https://cdn/abc.jpg',
    publishedAt: '2026-01-01T00:00:00.000Z',
    deliverableType: 'reel',
  });
  assert.equal(posts[1].title, '@madebyotg post');
  assert.equal(posts[1].deliverableType, 'photo_set');
});

test('import spends one credit within the daily cap and records it', async () => {
  const recorded = [];
  const budget = { canUseTool: () => true, record: (row) => recorded.push(row) };
  const settings = { get: () => 2000 };
  const fetchImpl = async (url, init) => {
    assert.equal(url, 'https://api.scrapecreators.com/v1/instagram/profile?handle=madebyotg');
    assert.equal(init.headers['x-api-key'], 'key');
    return { ok: true, status: 200, json: async () => PROFILE };
  };
  const { items } = await importInstagram({ handle: 'madebyotg', apiKey: 'key', budget, settings, fetchImpl });
  assert.equal(items.length, 2);
  assert.deepEqual(recorded, [{ provider: 'scrapecreators', modelOrTool: 'scrapecreators', taskType: 'portfolio_import', units: 1, costMicros: 2000 }]);
});

test('import is skipped without a key or when the cap is reached', async () => {
  const budget = { canUseTool: () => false, record: () => { throw new Error('should not record'); } };
  assert.match((await importInstagram({ handle: 'h', apiKey: '', budget, settings: {} })).skipped, /not set/);
  assert.match((await importInstagram({ handle: 'h', apiKey: 'k', budget, settings: {} })).skipped, /cap/);
});
