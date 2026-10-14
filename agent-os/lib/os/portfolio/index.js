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
        report.errors.push(`tagging ${item.id}: ${error.message}`);
        // A router failure means every provider is down; a bad reply for one piece should not block the rest.
        if (error.name === 'RouterError') break;
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
  const TAG_USAGE = 'Usage: /tag <number> lane=… style=… type=… location=…';
  function tag(args) {
    const [idText, ...pairs] = args;
    const id = Number(idText);
    if (!Number.isInteger(id) || id < 1 || !pairs.length) return TAG_USAGE;
    const tags = {};
    for (const pair of pairs) {
      const eq = pair.indexOf('=');
      if (eq === -1) return 'Use key=value, for example lane=winery.';
      const key = pair.slice(0, eq).trim().toLowerCase();
      if (!Object.hasOwn(TAG_RULES, key)) return `Unknown tag ${key}. Use lane, style, type or location.`;
      const rule = TAG_RULES[key];
      let value = pair.slice(eq + 1).replace(/_/g, ' ').trim();
      if (rule.values) value = value.toLowerCase();
      if (rule.values && !rule.values.includes(value)) return `${key} must be one of: ${rule.values.join(', ')}`;
      tags[rule.field] = value;
    }
    try {
      const item = store.setTags(id, tags, { confirmed: true });
      return `Saved: ${item.title} — ${item.lane || 'untagged'}${item.style ? `/${item.style}` : ''}${item.location ? ` (${item.location})` : ''}`;
    } catch (error) {
      return error.message;
    }
  }

  return { importAll, match, text, tag, store };
}
