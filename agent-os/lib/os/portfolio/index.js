// lib/os/portfolio/index.js
import { DELIVERABLES, STYLES } from '../gigs/constants.js';
import { importInstagram } from './instagramImporter.js';
import { matchPortfolio } from './matcher.js';
import { importSite } from './siteImporter.js';
import { suggestTags, TAG_LANES } from './tagger.js';

const TAG_RULES = {
  lane: { field: 'lane', values: TAG_LANES },
  style: { field: 'style', values: STYLES },
  type: { field: 'deliverableType', values: DELIVERABLES },
  location: { field: 'location', values: null },
};

export function createPortfolio({ store, router, budget, settings, scrapeCreatorsKey = '', fetchImpl = fetch, now = () => new Date() }) {
  async function importAll() {
    const report = { site: 0, instagram: 0, created: 0, tagged: 0, errors: [] };
    const save = (items, key) => {
      for (const item of items) {
        report[key] += 1;
        if (store.upsert(item).created) report.created += 1;
      }
    };
    try {
      const { items, errors } = await importSite({ siteUrl: settings.get('portfolio.site_url'), fetchImpl });
      report.errors.push(...errors.map((error) => `site: ${error}`));
      save(items, 'site');
    } catch (error) {
      report.errors.push(`site: ${error.message}`);
    }
    try {
      const result = await importInstagram({ handle: settings.get('portfolio.instagram_handle'), apiKey: scrapeCreatorsKey, budget, settings, fetchImpl });
      if (result.skipped) report.errors.push(`instagram: ${result.skipped}`);
      save(result.items, 'instagram');
    } catch (error) {
      report.errors.push(`instagram: ${error.message}`);
    }
    for (const item of store.untagged(10)) {
      try {
        store.setTags(item.id, await suggestTags(router, item));
        report.tagged += 1;
      } catch (error) {
        report.errors.push(`tagging: ${error.message}`);
        break;
      }
    }
    return report;
  }

  function match(want, limit = 3) {
    return matchPortfolio(store.list(), want, { limit, now: now().getTime() });
  }

  function text(limit = 25) {
    const items = store.list().slice(0, limit);
    if (!items.length) return 'No portfolio pieces yet. They import each morning from madebyotg.com and @madebyotg.';
    return [
      'Portfolio (fix one with /tag <number> lane=winery style=cinematic location=Napa):',
      ...items.map((item) => `${item.id}. ${item.title} — ${item.lane || 'untagged'}${item.style ? `/${item.style}` : ''}${item.tagsConfirmed ? ' ✓' : ''}`),
    ].join('\n');
  }

  // "/tag 3 lane=winery style=cinematic location=Napa_Valley" (underscores become spaces).
  function tag(args) {
    const [idText, ...pairs] = args;
    const tags = {};
    for (const pair of pairs) {
      const [key, raw = ''] = pair.split('=');
      const rule = TAG_RULES[key];
      if (!rule) return `Unknown tag ${key}. Use lane, style, type or location.`;
      const value = raw.replace(/_/g, ' ').trim();
      if (rule.values && !rule.values.includes(value)) return `${key} must be one of: ${rule.values.join(', ')}`;
      tags[rule.field] = value;
    }
    try {
      const item = store.setTags(Number(idText), tags, { confirmed: true });
      return `Saved: ${item.title} — ${item.lane || 'untagged'}${item.style ? `/${item.style}` : ''}${item.location ? ` (${item.location})` : ''}`;
    } catch (error) {
      return error.message;
    }
  }

  return { importAll, match, text, tag, store };
}
