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

export const TAG_KEYS = Object.keys(TAG_RULES);

// Checks owner tag corrections ({ lane, style, type, location }, or [key, value] pairs) the way /tag does. Returns the store fields to save,
// or { error } with the message /tag shows. In free text underscores become spaces ("location=Napa_Valley");
// listed values keep theirs, so lane=real_estate and type=photo_set match.
export function parseTags(input) {
  const tags = {};
  for (const [rawKey, rawValue] of Array.isArray(input) ? input : Object.entries(input ?? {})) {
    const key = String(rawKey).trim().toLowerCase();
    if (!Object.hasOwn(TAG_RULES, key)) return { error: `Unknown tag ${key}. Use lane, style, type or location.` };
    const rule = TAG_RULES[key];
    const raw = String(rawValue ?? '').trim();
    const value = rule.values ? raw.toLowerCase() : raw.replace(/_/g, ' ').trim();
    if (rule.values && !rule.values.includes(value)) return { error: `${key} must be one of: ${rule.values.join(', ')}` };
    tags[rule.field] = value;
  }
  return { tags };
}

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
    const input = [];
    for (const pair of pairs) {
      const eq = pair.indexOf('=');
      if (eq === -1) return 'Use key=value, for example lane=winery.';
      input.push([pair.slice(0, eq), pair.slice(eq + 1)]);
    }
    const { tags, error } = parseTags(input);
    if (error) return error;
    try {
      const item = store.setTags(id, tags, { confirmed: true });
      return `Saved: ${item.title} — ${item.lane || 'untagged'}${item.style ? `/${item.style}` : ''}${item.location ? ` (${item.location})` : ''}`;
    } catch (error) {
      return error.message;
    }
  }

  return { importAll, match, text, tag, store };
}
