// tests/osSiteFetch.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { candidateLinks, createSiteFetch, extractEmails, htmlToText, robotsAllows } from '../lib/os/gigs/siteFetch.js';

test('htmlToText drops scripts, styles and tags', () => {
  assert.equal(htmlToText('<style>a{}</style><p>Hi&nbsp;there</p><script>x()</script><b>!</b>'), 'Hi there !');
});

test('emails come from mailto links and text, minus junk', () => {
  const html = '<a href="mailto:Events@Winery.com?subject=x">mail</a> info [at] nope.com sales@winery.com logo@2x.png noreply@winery.com user@example.com';
  assert.deepEqual(extractEmails(html, 'https://winery.com/contact').map((e) => e.email), ['events@winery.com', 'sales@winery.com']);
});

test('candidate links stay on the same site and look relevant', () => {
  const html = '<a href="/contact-us">Contact</a><a href="https://other.com/contact">x</a><a href="/shop">Shop</a><a href="/weddings">Weddings</a><a href="/about">About</a><a href="/team">Team</a>';
  assert.deepEqual(candidateLinks(html, 'https://winery.com/'), ['https://winery.com/contact-us', 'https://winery.com/weddings', 'https://winery.com/about']);
});

test('robots.txt rules for every crawler are respected', () => {
  const robots = 'User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /private\nDisallow:\n';
  assert.equal(robotsAllows(robots, '/contact'), true);
  assert.equal(robotsAllows(robots, '/private/x'), false);
  assert.equal(robotsAllows('User-agent: *\nDisallow: /', '/'), false);
  assert.equal(robotsAllows('', '/'), true);
});

test('fetchSite reads the homepage and relevant pages', async () => {
  const pages = {
    'https://winery.com/robots.txt': { type: 'text/plain', body: 'User-agent: *\nDisallow: /private' },
    'https://winery.com/': { type: 'text/html', body: '<h1>Vine Estate</h1><a href="/contact">Contact</a><a href="/private/events">Events</a>' },
    'https://winery.com/contact': { type: 'text/html; charset=utf-8', body: '<p>Email events@winery.com</p>' },
  };
  const fetchImpl = async (url) => {
    const page = pages[String(url)];
    return { ok: Boolean(page), status: page ? 200 : 404, headers: { get: () => page?.type ?? 'text/html' }, text: async () => page?.body ?? '' };
  };
  const site = await createSiteFetch({ fetchImpl }).fetchSite('winery.com');
  assert.deepEqual(site.pages.map((p) => p.url), ['https://winery.com/', 'https://winery.com/contact']);
  assert.deepEqual(site.emails, [{ email: 'events@winery.com', sourceUrl: 'https://winery.com/contact' }]);
  assert.equal(site.blocked, false);
});

test('a site that blocks all crawlers is reported as blocked', async () => {
  const fetchImpl = async (url) => ({ ok: true, status: 200, headers: { get: () => 'text/plain' }, text: async () => (String(url).endsWith('robots.txt') ? 'User-agent: *\nDisallow: /' : '') });
  const site = await createSiteFetch({ fetchImpl }).fetchSite('https://closed.com');
  assert.equal(site.blocked, true);
  assert.deepEqual(site.pages, []);
});
