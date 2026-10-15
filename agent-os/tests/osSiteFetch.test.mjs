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
    return { ok: Boolean(page), status: page ? 200 : 404, url: String(url), headers: { get: () => page?.type ?? 'text/html' }, text: async () => page?.body ?? '' };
  };
  const site = await createSiteFetch({ fetchImpl }).fetchSite('winery.com');
  assert.deepEqual(site.pages.map((p) => p.url), ['https://winery.com/', 'https://winery.com/contact']);
  assert.deepEqual(site.emails, [{ email: 'events@winery.com', sourceUrl: 'https://winery.com/contact' }]);
  assert.equal(site.blocked, false);
});

test('a site that blocks all crawlers is reported as blocked', async () => {
  const fetchImpl = async (url) => ({ ok: true, status: 200, url: String(url), headers: { get: () => 'text/plain' }, text: async () => (String(url).endsWith('robots.txt') ? 'User-agent: *\nDisallow: /' : '') });
  const site = await createSiteFetch({ fetchImpl }).fetchSite('https://closed.com');
  assert.equal(site.blocked, true);
  assert.deepEqual(site.pages, []);
});

function timed(fn) {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

test('hostile input is handled in linear time', () => {
  const longRun = 'a'.repeat(100_000);
  const unclosedAnchors = '<a '.repeat(34_000);
  const unclosedScripts = '<script'.repeat(15_000);
  const manyOpenAnchors = '<a href="/contact">x'.repeat(5_000);
  for (const input of [longRun, unclosedAnchors, unclosedScripts, manyOpenAnchors]) {
    assert.ok(timed(() => extractEmails(input, 'https://x.com/')) < 1000);
    assert.ok(timed(() => candidateLinks(input, 'https://x.com/')) < 1000);
    assert.ok(timed(() => htmlToText(input)) < 1000);
  }
});

test('mailto handling is tolerant and strict about what counts as an email', () => {
  const emails = (html) => extractEmails(html, 'https://x.com/').map((e) => e.email);
  assert.deepEqual(emails('<a href="mailto:50%off@x.com">x</a>'), []);
  assert.deepEqual(emails('<a href="mailto:a@b.com,c@d.com">x</a>'), ['a@b.com', 'c@d.com']);
  assert.deepEqual(emails('<a href="mailto:notanemail">x</a>'), []);
  assert.deepEqual(emails('<a href="mailto:a@b.com?subject=x">x</a>'), ['a@b.com']);
  assert.deepEqual(emails('<a href="mailto:a&#64;b.com">x</a> c&#x40;d.com'), ['a@b.com', 'c@d.com']);
});

test('candidate links accept single quotes, drop fragments and files, and put contact pages first', () => {
  const html = "<a href='/about'>About</a><a href=\"/events#top\">Events</a><a href=\"/brochure.pdf\">contact pdf</a><a href=\"/team\">Team</a><a href=\"/contact\">Reach us</a>";
  assert.deepEqual(candidateLinks(html, 'https://winery.com/'), ['https://winery.com/contact', 'https://winery.com/about', 'https://winery.com/events']);
  assert.deepEqual(candidateLinks('<a href="/contact.html">c</a><a href="/about.php">a</a>', 'https://winery.com/'), ['https://winery.com/contact.html', 'https://winery.com/about.php']);
});

test('robots Allow rules win by longest match, ties go to Allow', () => {
  const robots = 'User-agent: *\nDisallow: /private\nAllow: /private/public\n';
  assert.equal(robotsAllows(robots, '/private/public/x'), true);
  assert.equal(robotsAllows(robots, '/private/x'), false);
  assert.equal(robotsAllows('User-agent: *\nDisallow: /a\nAllow: /a', '/a'), true);
  assert.equal(robotsAllows('User-agent: *\nAllow: /\nDisallow: /a', '/a/b'), false);
});

function siteFetchImpl(pages) {
  return async (url) => {
    const page = pages[String(url)];
    if (!page) return { ok: false, status: 404, url: String(url), headers: { get: () => 'text/html' }, text: async () => '' };
    return { ok: (page.status ?? 200) < 400, status: page.status ?? 200, url: page.url ?? String(url), headers: { get: () => page.type ?? 'text/html' }, text: async () => page.body ?? '' };
  };
}

test('a 5xx robots.txt means the site is treated as blocked', async () => {
  const fetchImpl = siteFetchImpl({
    'https://winery.com/robots.txt': { status: 503, type: 'text/plain' },
    'https://winery.com/': { body: '<p>hello</p>' },
  });
  const site = await createSiteFetch({ fetchImpl }).fetchSite('winery.com');
  assert.equal(site.blocked, true);
  assert.deepEqual(site.pages, []);
});

test('an apex to www redirect is the same site', async () => {
  const fetchImpl = siteFetchImpl({
    'https://winery.com/': { url: 'https://www.winery.com/', body: '<a href="/contact">Contact</a>' },
    'https://www.winery.com/contact': { body: '<p>events@winery.com</p>' },
  });
  const site = await createSiteFetch({ fetchImpl }).fetchSite('winery.com');
  assert.deepEqual(site.pages.map((p) => p.url), ['https://www.winery.com/', 'https://www.winery.com/contact']);
  assert.deepEqual(site.emails, [{ email: 'events@winery.com', sourceUrl: 'https://www.winery.com/contact' }]);
  assert.equal(site.blocked, false);
});

test('a redirect to a different site is reported and not read', async () => {
  const fetchImpl = siteFetchImpl({
    'https://winery.com/': { url: 'https://other.com/landing', body: '<p>other@other.com</p>' },
  });
  const site = await createSiteFetch({ fetchImpl }).fetchSite('winery.com');
  assert.deepEqual(site, { pages: [], emails: [], blocked: false, offSite: 'https://other.com/landing' });
});

test('private addresses are refused', async () => {
  const fetchImpl = siteFetchImpl({});
  for (const target of ['http://127.0.0.1', 'localhost', 'http://10.1.2.3/', 'http://192.168.0.5', 'http://172.20.0.1', 'http://169.254.169.254', 'printer.local']) {
    await assert.rejects(createSiteFetch({ fetchImpl }).fetchSite(target), /Refusing to read a private address\./);
  }
});
