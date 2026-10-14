// tests/osPortfolioSite.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { importSite, parseWorkIndex, parseWorkPage } from '../lib/os/portfolio/siteImporter.js';

const INDEX = `<a href="/work/">Work</a><a href="work/brynlee-hall/">B</a><a href="/work/cypress-garden-editorial/">C</a>
  <a href="https://madebyotg.com/work/brynlee-hall/">dup</a><a href="/services/">S</a><a href="/work/a/b/">deep</a>`;

const PAGE = `<html><head><title>Brynlee Hall — 1st Place, Pro — Off The Ground</title>
<meta name="description" content="Competition coverage for a pro wakesurfer.">
<meta property="og:title" content="Brynlee Hall">
<meta property="og:description" content="Competition coverage for a pro wakesurfer: aerial &amp; chase-boat cinematography.">
<meta property="og:image" content="https://madebyotg.com/assets/video/brynlee-poster.jpg">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"BreadcrumbList"},
{"@type":"VideoObject","name":"Brynlee Hall","thumbnailUrl":"https://madebyotg.com/x.jpg","uploadDate":"2026-01-01"}]}</script>
</head></html>`;

test('work index yields unique piece urls', () => {
  assert.deepEqual(parseWorkIndex(INDEX, 'https://madebyotg.com/'), [
    'https://madebyotg.com/work/brynlee-hall/',
    'https://madebyotg.com/work/cypress-garden-editorial/',
  ]);
});

test('work page metadata becomes a portfolio item', () => {
  assert.deepEqual(parseWorkPage(PAGE, 'https://madebyotg.com/work/brynlee-hall/'), {
    source: 'site',
    url: 'https://madebyotg.com/work/brynlee-hall/',
    title: 'Brynlee Hall',
    description: 'Competition coverage for a pro wakesurfer: aerial & chase-boat cinematography.',
    thumbnailUrl: 'https://madebyotg.com/assets/video/brynlee-poster.jpg',
    publishedAt: '2026-01-01',
    deliverableType: 'film',
  });
});

test('importSite reads the index then each page and reports failures', async () => {
  const pages = {
    'https://madebyotg.com/work/': INDEX,
    'https://madebyotg.com/work/brynlee-hall/': PAGE,
  };
  const fetchImpl = async (url) => (pages[url]
    ? { ok: true, status: 200, text: async () => pages[url] }
    : { ok: false, status: 404, text: async () => '' });
  const { items, errors } = await importSite({ siteUrl: 'https://madebyotg.com', fetchImpl });
  assert.deepEqual(items.map((i) => i.title), ['Brynlee Hall']);
  assert.match(errors[0], /cypress-garden-editorial.*404/);
});
