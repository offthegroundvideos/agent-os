// tests/osGigEngine.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { openOsDb } from '../lib/os/db.js';
import { createSettings } from '../lib/os/settings.js';
import { createGigStore } from '../lib/os/gigs/store.js';
import { createStages } from '../lib/os/gigs/stages.js';
import { pitchKey } from '../lib/os/gigs/outreach.js';
import { createGigEngine } from '../lib/os/gigs/engine.js';

const PATHS = {
  found: [],
  researched: ['researched'],
  pitched: ['researched', 'pitched'],
  closed_not_now: ['researched', 'pitched', 'replied', 'closed_not_now'],
};

function setup({ canEmail = true, finderError = null } = {}) {
  let t = Date.parse('2026-10-14T12:00:00Z'); // Wednesday 05:00 Pacific
  const clock = { now: () => new Date(t), set: (iso) => { t = Date.parse(iso); } };
  const osDb = openOsDb(':memory:');
  const settings = createSettings(osDb);
  const store = createGigStore(osDb, { now: clock.now });
  const stages = createStages(osDb, { now: clock.now });
  const hooks = {};
  const calls = { imports: 0, finds: [], research: [], pitches: [], followUps: [], polls: 0 };
  const portfolio = { importAll: async () => { calls.imports += 1; return { created: 0 }; }, text: () => 'portfolio list', tag: (args) => `tag ${args.join(' ')}` };
  const finder = { findForLane: async (lane) => { if (finderError) throw finderError; if (hooks.findForLane) await hooks.findForLane(lane); calls.finds.push(lane); return { lane }; } };
  const research = {
    research: async (id) => {
      calls.research.push(id);
      if (hooks.research) await hooks.research(id);
      stages.move(id, 'closed_lost', { patch: { close_reason: 'not_a_fit' } });
      return { closed: 'not_a_fit' };
    },
  };
  const outreach = {
    draftPitch: async (id) => { calls.pitches.push(id); if (hooks.draftPitch) await hooks.draftPitch(id); return { actionId: `act_${calls.pitches.length}` }; },
    draftFollowUp: async (id, options) => { calls.followUps.push({ id, ...options }); if (hooks.draftFollowUp) await hooks.draftFollowUp(id); return { actionId: 'act_f' }; },
  };
  const threads = {};
  const gmail = { thread: async (id) => { if (hooks.thread) await hooks.thread(id); return threads[id] ?? { messages: [] }; } };
  const triage = { poll: async () => { calls.polls += 1; return { checked: 1, handled: 1 }; } };
  const logs = [];
  const engine = createGigEngine({ settings, store, stages, portfolio, finder, research, outreach, triage, gmail, canEmail, now: clock.now, log: (line) => logs.push(line) });
  function addOpp(name, stage = 'found', patch = {}) {
    const { business } = store.upsertBusiness({ name, lane: 'winery', website: `${name}.com` });
    const { opportunity } = store.createOpportunity(business.id);
    for (const step of PATHS[stage]) stages.move(opportunity.id, step);
    if (Object.keys(patch).length) stages.update(opportunity.id, patch);
    return opportunity.id;
  }
  function addAction(key, status) {
    osDb.db.prepare(`INSERT INTO actions (id, idempotency_key, action_type, tool, payload, why, autonomy_level, status, reject_reason, created_at, updated_at)
      VALUES (?, ?, 'email.first_contact', 'email.pitch', '{}', '{}', 'ask', ?, 'wrong_target', ?, ?)`).run(`act_${key}`, key, status, clock.now().toISOString(), clock.now().toISOString());
  }
  return { hooks, osDb, clock, settings, store, stages, engine, calls, threads, logs, addOpp, addAction };
}

test('daily jobs run once per Pacific day at their hour, prospecting only on weekdays', async () => {
  const ctx = setup();
  await ctx.engine.tick();
  assert.deepEqual([ctx.calls.imports, ctx.calls.finds.length, ctx.calls.polls], [0, 0, 1]);
  ctx.clock.set('2026-10-14T13:01:00Z'); // 06:01
  await ctx.engine.tick();
  assert.equal(ctx.calls.imports, 1);
  assert.equal(ctx.calls.finds.length, 0);
  ctx.clock.set('2026-10-14T14:30:00Z'); // 07:30 Wednesday
  await ctx.engine.tick();
  await ctx.engine.tick();
  assert.deepEqual(ctx.calls.finds, ['travel', 'winery', 'wedding']);
  assert.equal(ctx.calls.imports, 1);
  assert.equal(ctx.calls.polls, 3);
  ctx.clock.set('2026-10-15T14:30:00Z'); // Thursday: lanes rotate by one
  await ctx.engine.tick();
  assert.deepEqual(ctx.calls.finds.slice(3), ['winery', 'wedding', 'real_estate']);
  ctx.clock.set('2026-10-17T15:00:00Z'); // Saturday
  await ctx.engine.tick();
  assert.equal(ctx.calls.finds.length, 6);
  ctx.osDb.close();
});

test('research takes two per tick within the daily cap', async () => {
  const ctx = setup();
  ctx.settings.set('gigs.daily_research', 3);
  ['a', 'b', 'c', 'd'].forEach((name) => ctx.addOpp(name));
  await ctx.engine.tick();
  assert.equal(ctx.calls.research.length, 2);
  await ctx.engine.tick();
  assert.equal(ctx.calls.research.length, 3);
  await ctx.engine.tick();
  assert.equal(ctx.calls.research.length, 3);
  ctx.osDb.close();
});

test('pitches need email, respect the daily limit and close rejected pitches', async () => {
  const off = setup({ canEmail: false });
  off.addOpp('a', 'researched');
  await off.engine.tick();
  assert.deepEqual(off.calls.pitches, []);
  off.osDb.close();

  const ctx = setup();
  ctx.settings.set('outreach.daily_pitch_limit', 2);
  const ids = ['a', 'b', 'c'].map((name) => ctx.addOpp(name, 'researched'));
  await ctx.engine.tick();
  assert.deepEqual(ctx.calls.pitches, [ids[0], ids[1]]);
  ctx.addAction(pitchKey(ctx.store.getOpportunity(ids[2])), 'rejected');
  await ctx.engine.tick();
  const closed = ctx.store.getOpportunity(ids[2]);
  assert.equal(closed.stage, 'closed_lost');
  assert.equal(closed.closeReason, 'pitch_rejected');
  ctx.osDb.close();
});

test('follow-ups wait for the first email to be sent, then draft in the thread; the last one closes', async () => {
  const ctx = setup();
  ctx.clock.set('2026-10-20T17:00:00Z');
  const waiting = ctx.addOpp('a', 'pitched', { gmail_thread_id: 'th1', next_follow_up_at: '2026-10-18T17:00:00.000Z', last_message_id_header: '<draft@x>' });
  const done = ctx.addOpp('b', 'pitched', { follow_ups_sent: 2, next_follow_up_at: '2026-10-19T17:00:00.000Z' });
  ctx.threads.th1 = { messages: [{ labelIds: ['DRAFT'], messageIdHeader: '<draft@x>' }] };
  await ctx.engine.tick();
  assert.deepEqual(ctx.calls.followUps, []);
  assert.equal(ctx.store.getOpportunity(waiting).nextFollowUpAt, '2026-10-21T17:00:00.000Z');
  assert.equal(ctx.store.getOpportunity(done).stage, 'closed_lost');
  assert.equal(ctx.store.getOpportunity(done).closeReason, 'no_reply');
  ctx.threads.th1 = { messages: [{ labelIds: ['SENT'], messageIdHeader: '<sent@x>' }] };
  ctx.clock.set('2026-10-21T18:00:00Z');
  await ctx.engine.tick();
  assert.deepEqual(ctx.calls.followUps, [{ id: waiting, inReplyTo: '<sent@x>' }]);
  assert.equal(ctx.store.getOpportunity(waiting).nextFollowUpAt, null);
  ctx.osDb.close();
});

test('check-ins reopen not-now prospects', async () => {
  const ctx = setup();
  const id = ctx.addOpp('a', 'closed_not_now', { check_in_at: '2026-10-01T00:00:00.000Z' });
  await ctx.engine.tick();
  assert.equal(ctx.store.getOpportunity(id).stage, 'researched');
  assert.equal(ctx.store.getOpportunity(id).checkInAt, null);
  ctx.osDb.close();
});

test('pause stops everything, and one failing job does not stop the others', async () => {
  const paused = setup();
  paused.settings.set('os.paused', true);
  assert.deepEqual(await paused.engine.tick(), { paused: true });
  paused.osDb.close();

  const ctx = setup({ finderError: new Error('xAI 503') });
  ctx.clock.set('2026-10-14T14:30:00Z');
  ctx.addOpp('a');
  const report = await ctx.engine.tick();
  assert.match(ctx.logs[0], /gigs prospecting failed: xAI 503/);
  assert.equal(report.research.length, 1);
  ctx.osDb.close();
});

test('pipeline text and lane pausing', async () => {
  const ctx = setup();
  ctx.addOpp('vine', 'researched');
  ctx.addOpp('oak');
  assert.match(ctx.engine.pipelineText(), /^Pipeline · approved emails become Gmail drafts\nfound: 1 · researched: 1\nClosed: 0\nLatest:\n• /);
  assert.equal(ctx.engine.setLanePaused('winery', 'paused by Jack'), 'Paused winery outreach.');
  assert.match(ctx.engine.pipelineText(), /Paused: winery \(paused by Jack\)/);
  assert.equal(ctx.engine.setLanePaused('winery', null), 'Resumed winery outreach.');
  assert.match(ctx.engine.setLanePaused('boats', null), /Lanes are: travel, winery, wedding, real_estate/);
  assert.equal(ctx.engine.portfolioText(), 'portfolio list');
  assert.equal(ctx.engine.tagPortfolio(['3', 'lane=winery']), 'tag 3 lane=winery');
  ctx.osDb.close();
});

const HOUR = 3_600_000;
const advance = (ctx, ms) => ctx.clock.set(new Date(ctx.clock.now().getTime() + ms).toISOString());

test('a pitch that throws does not block the next one, backs off, and closes after three failures', async () => {
  const ctx = setup();
  const [a, b] = ['a', 'b'].map((name) => ctx.addOpp(name, 'researched'));
  ctx.hooks.draftPitch = async (id) => { if (id === a) throw new Error('model down'); };
  const report = await ctx.engine.tick();
  assert.deepEqual(ctx.calls.pitches, [a, b]);
  assert.ok(report.pitches.some((r) => r.id === a && /model down/.test(r.error)));
  await ctx.engine.tick();
  assert.equal(ctx.calls.pitches.filter((id) => id === a).length, 1); // still backing off
  advance(ctx, HOUR + 1000);
  await ctx.engine.tick();
  assert.equal(ctx.calls.pitches.filter((id) => id === a).length, 2);
  advance(ctx, 6 * HOUR + 1000);
  await ctx.engine.tick();
  assert.equal(ctx.calls.pitches.filter((id) => id === a).length, 3);
  const closed = ctx.store.getOpportunity(a);
  assert.equal(closed.stage, 'closed_lost');
  assert.equal(closed.closeReason, 'draft_failed');
  assert.ok(ctx.logs.some((line) => /model down/.test(line)));
  ctx.osDb.close();
});

test('a failed pitch action closes the opportunity; paused lanes get no draft', async () => {
  const ctx = setup();
  const failed = ctx.addOpp('a', 'researched');
  ctx.addAction(pitchKey(ctx.store.getOpportunity(failed)), 'failed');
  await ctx.engine.tick();
  assert.equal(ctx.store.getOpportunity(failed).stage, 'closed_lost');
  assert.equal(ctx.store.getOpportunity(failed).closeReason, 'pitch_failed');
  ctx.addOpp('b', 'researched');
  ctx.settings.set('outreach.paused_lanes', { winery: 'paused by Jack' });
  await ctx.engine.tick();
  assert.deepEqual(ctx.calls.pitches, []);
  ctx.osDb.close();
});

test('at most three pitches per tick', async () => {
  const ctx = setup();
  ['a', 'b', 'c', 'd'].forEach((name) => ctx.addOpp(name, 'researched'));
  await ctx.engine.tick();
  assert.equal(ctx.calls.pitches.length, 3);
  ctx.osDb.close();
});

test('a follow-up that throws moves one day out and is not retried; the third failure gives up', async () => {
  const ctx = setup();
  ctx.clock.set('2026-10-20T17:00:00Z');
  const id = ctx.addOpp('a', 'pitched', { next_follow_up_at: '2026-10-19T17:00:00.000Z' });
  ctx.hooks.draftFollowUp = async () => { throw new Error('draft broke'); };
  await ctx.engine.tick();
  assert.equal(ctx.store.getOpportunity(id).nextFollowUpAt, '2026-10-21T17:00:00.000Z');
  await ctx.engine.tick();
  assert.equal(ctx.calls.followUps.length, 1);
  advance(ctx, 25 * HOUR);
  await ctx.engine.tick();
  advance(ctx, 25 * HOUR);
  await ctx.engine.tick();
  assert.equal(ctx.calls.followUps.length, 3);
  assert.equal(ctx.store.getOpportunity(id).nextFollowUpAt, null);
  assert.ok(ctx.logs.some((line) => /giving up on follow-ups for a/.test(line)));
  ctx.osDb.close();
});

test('a deleted first email (thread 404) stops follow-ups without retrying', async () => {
  const ctx = setup();
  ctx.clock.set('2026-10-20T17:00:00Z');
  const id = ctx.addOpp('a', 'pitched', { gmail_thread_id: 'gone', next_follow_up_at: '2026-10-19T17:00:00.000Z' });
  ctx.hooks.thread = async () => { throw new Error('Gmail 404: Requested entity was not found.'); };
  await ctx.engine.tick();
  assert.equal(ctx.store.getOpportunity(id).nextFollowUpAt, null);
  assert.deepEqual(ctx.calls.followUps, []);
  assert.ok(ctx.logs.some((line) => /deleted/.test(line)));
  ctx.osDb.close();
});

test('research that throws does not block the next prospect and closes after three failures', async () => {
  const ctx = setup();
  const [a, b] = ['a', 'b'].map((name) => ctx.addOpp(name));
  ctx.hooks.research = async (id) => { if (id === a) throw new Error('site timeout'); };
  const report = await ctx.engine.tick();
  assert.deepEqual(ctx.calls.research, [a, b]);
  assert.ok(report.research.some((r) => r.id === a && /site timeout/.test(r.error)));
  advance(ctx, HOUR + 1000);
  await ctx.engine.tick();
  advance(ctx, 6 * HOUR + 1000);
  await ctx.engine.tick();
  assert.equal(ctx.calls.research.filter((id) => id === a).length, 3);
  assert.equal(ctx.store.getOpportunity(a).stage, 'closed_lost');
  assert.equal(ctx.store.getOpportunity(a).closeReason, 'research_error');
  ctx.osDb.close();
});

test('prospecting continues with the other lanes when one lane throws', async () => {
  const ctx = setup();
  ctx.clock.set('2026-10-14T14:30:00Z');
  ctx.hooks.findForLane = async (lane) => { if (lane === 'travel') throw new Error('xAI 503'); };
  const report = await ctx.engine.tick();
  assert.deepEqual(ctx.calls.finds, ['winery', 'wedding']);
  assert.ok(report.prospecting.some((r) => r.lane === 'travel' && /xAI 503/.test(r.error)));
  assert.match(ctx.logs.join('\n'), /gigs prospecting failed: xAI 503/);
  ctx.osDb.close();
});

test('portfolio import errors are logged', async () => {
  const ctx = setup();
  ctx.clock.set('2026-10-14T13:30:00Z');
  const logs = [];
  const engine = createGigEngine({
    settings: ctx.settings, store: ctx.store, stages: ctx.stages, now: ctx.clock.now, log: (line) => logs.push(line),
    portfolio: { importAll: async () => ({ errors: ['site: 500', 'instagram: no key'] }) },
    research: { research: async () => ({}) }, outreach: {},
  });
  await engine.tick();
  assert.ok(logs.includes('portfolio import: site: 500; instagram: no key'));
  ctx.osDb.close();
});

test('a pause set mid-tick stops the later jobs', async () => {
  const ctx = setup();
  ctx.clock.set('2026-10-14T14:30:00Z');
  ctx.addOpp('a');
  ctx.hooks.findForLane = async () => { ctx.settings.set('os.paused', true); };
  await ctx.engine.tick();
  assert.equal(ctx.calls.research.length, 0);
  assert.equal(ctx.calls.polls, 0);
  ctx.osDb.close();
});

test('booked shows in the pipeline text', async () => {
  const ctx = setup();
  const id = ctx.addOpp('a', 'researched');
  for (const step of ['pitched', 'replied', 'quoted', 'held', 'booked']) ctx.stages.move(id, step);
  assert.match(ctx.engine.pipelineText(), /booked: 1/);
  ctx.osDb.close();
});

test('a reopened prospect starts its follow-ups fresh', async () => {
  const ctx = setup();
  const id = ctx.addOpp('a', 'closed_not_now', {
    check_in_at: '2026-10-01T00:00:00.000Z', follow_ups_sent: 2, next_follow_up_at: '2026-10-05T00:00:00.000Z', pitched_at: '2026-09-01T00:00:00.000Z',
  });
  await ctx.engine.tick();
  const reopened = ctx.store.getOpportunity(id);
  assert.equal(reopened.stage, 'researched');
  assert.equal(reopened.followUpsSent, 0);
  assert.equal(reopened.nextFollowUpAt, null);
  assert.equal(reopened.pitchedAt, null);
  ctx.osDb.close();
});

class RouterError extends Error {
  constructor(message) { super(message); this.name = 'RouterError'; }
}

test('a model outage during research pauses the job for an hour instead of failing or closing prospects', async () => {
  const ctx = setup();
  const [a, b] = ['a', 'b'].map((name) => ctx.addOpp(name));
  ctx.hooks.research = async () => { throw new RouterError('anthropic not configured'); };
  await ctx.engine.tick();
  assert.deepEqual(ctx.calls.research, [a]); // stopped at the first outage
  assert.equal(ctx.store.getOpportunity(a).stage, 'found');
  assert.equal(ctx.store.getOpportunity(b).stage, 'found');
  assert.match(ctx.logs.join('\n'), /gigs research paused: anthropic not configured/);
  advance(ctx, 30 * 60_000);
  await ctx.engine.tick();
  assert.deepEqual(ctx.calls.research, [a]); // still cooling down
  advance(ctx, 31 * 60_000);
  await ctx.engine.tick();
  assert.deepEqual(ctx.calls.research, [a, a]); // an hour later it tries again
  // Outages are not strikes: after three outages the prospect is still open.
  advance(ctx, HOUR + 1000);
  await ctx.engine.tick();
  assert.equal(ctx.store.getOpportunity(a).stage, 'found');
  ctx.hooks.research = null;
  advance(ctx, HOUR + 1000);
  await ctx.engine.tick();
  assert.ok(ctx.calls.research.includes(b));
  ctx.osDb.close();
});

test('a model outage while drafting pitches pauses the job for an hour and leaves the prospect researched', async () => {
  const ctx = setup();
  const [a, b] = ['a', 'b'].map((name) => ctx.addOpp(name, 'researched'));
  ctx.hooks.draftPitch = async () => { throw new RouterError('monthly budget cap reached'); };
  await ctx.engine.tick();
  assert.deepEqual(ctx.calls.pitches, [a]);
  assert.equal(ctx.store.getOpportunity(a).stage, 'researched');
  assert.equal(ctx.store.getOpportunity(b).stage, 'researched');
  assert.match(ctx.logs.join('\n'), /gigs pitches paused: monthly budget cap reached/);
  await ctx.engine.tick();
  assert.deepEqual(ctx.calls.pitches, [a]);
  advance(ctx, HOUR + 1000);
  ctx.hooks.draftPitch = null;
  await ctx.engine.tick();
  assert.deepEqual(ctx.calls.pitches, [a, a, b]);
  ctx.osDb.close();
});

test('prospecting skips the day when the research backlog is more than twice the daily cap', async () => {
  const ctx = setup();
  ctx.clock.set('2026-10-14T14:30:00Z'); // 07:30 Wednesday
  ctx.settings.set('gigs.daily_research', 2);
  for (let i = 0; i < 5; i += 1) ctx.addOpp(`p${i}`);
  const report = await ctx.engine.tick();
  assert.deepEqual(report.prospecting, { skipped: 'research backlog' });
  assert.deepEqual(ctx.calls.finds, []);
  await ctx.engine.tick();
  assert.deepEqual(ctx.calls.finds, []); // still marked as run for today
  ctx.osDb.close();
});
