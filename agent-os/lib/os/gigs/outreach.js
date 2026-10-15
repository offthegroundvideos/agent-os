// lib/os/gigs/outreach.js
import { extractJson } from '../json.js';
import { LANE_LABELS } from './constants.js';

const ABOUT_JACK = 'Jack Riggs, owner of OFF THE GROUND (MadeByOTG.com), a photo, video and drone production company in Fairfax, California. He travels anywhere and loves French Polynesia; locally he covers Marin, Napa, Sonoma and San Francisco, with extra shooters and editors on call.';
const VOICE = 'Write like Jack: warm, direct, specific, no hype, no buzzwords, no exclamation marks. No prices. Do not add a signature or unsubscribe line; those are added automatically.';

export const PITCH_SYSTEM = `You write first-contact emails for ${ABOUT_JACK}
${VOICE}
70-120 words. Open with the specific angle. Offer one concrete content idea they could use. Include the portfolio links given, as a short list, each with a one-line description. End with a low-pressure question, such as whether a short call next week makes sense.
Reply with only JSON: {"subject": "under 60 characters, specific, no clickbait", "body": "the email body, starting with a greeting"}`;

export const FOLLOW_UP_SYSTEM = `You write short follow-up emails for ${ABOUT_JACK} It replies in the same thread as an earlier email that got no answer.
${VOICE}
40-70 words. No guilt and no "just bumping this". Add one new, specific idea or detail relevant to their business. Don't repeat the portfolio links. End with an easy yes-or-no question.
Reply with only JSON: {"body": "..."}`;

export const PORTFOLIO_SYSTEM = `You reply for ${ABOUT_JACK} The prospect asked to see examples of OTG's work.
${VOICE}
50-90 words. Thank them, share the pieces given (title, link and one line on why each fits what they asked for), and suggest a next step.
Reply with only JSON: {"body": "..."}`;

export const pitchKey = (opp) => `pitch:${opp.id}:v${opp.version}`;

export const replySubject = (subject) => (/^re:/i.test(subject) ? subject : `Re: ${subject}`);

export function pitchBrief(opp, pieces) {
  return [
    `Business: ${opp.business.name} (${opp.business.website})`,
    `Lane: ${LANE_LABELS[opp.lane]}`,
    `Location: ${opp.business.location || 'unknown'}`,
    `Contact: ${[opp.contact?.name, opp.contact?.role].filter(Boolean).join(', ') || 'name unknown'}`,
    `Angle: ${opp.angle || 'none'}`,
    `Evidence: ${opp.evidence.join('; ') || 'none'}`,
    'Portfolio links:',
    ...(pieces.length ? pieces.map((piece) => `- ${piece.title} — ${piece.url} — ${piece.description}`) : ['- OTG portfolio — https://madebyotg.com/work/']),
  ].join('\n');
}

export function createOutreach({ router, store, portfolio, registry, settings }) {
  async function draft(system, content, maxTokens) {
    const result = await router.run('draft', { system, messages: [{ role: 'user', content }], maxTokens });
    return { email: extractJson(result.text), needsReview: Boolean(result.needsReview) };
  }

  const goal = (opp) => `Book paid ${LANE_LABELS[opp.lane]} shoots`;

  async function draftPitch(opportunityId) {
    const opp = store.getOpportunity(opportunityId);
    if (opp?.stage !== 'researched' || !opp.contact) return { skipped: 'not ready to pitch' };
    const pieces = opp.portfolioIds.map((id) => portfolio.store.get(id)).filter(Boolean);
    const { email, needsReview } = await draft(PITCH_SYSTEM, pitchBrief(opp, pieces), 1200);
    if (!email.subject || !email.body) throw new Error('The pitch draft came back without a subject or body.');
    const lastDay = settings.get('outreach.follow_up_days').at(-1) ?? 9;
    const action = await registry.request({
      tool: 'email.pitch',
      payload: {
        opportunityId: opp.id, business: opp.business.name, to: opp.contact.email, subject: String(email.subject).replace(/\s+/g, ' ').trim().slice(0, 120),
        draft: String(email.body).trim(), portfolioIds: pieces.map((piece) => piece.id), needsReview,
      },
      why: {
        goal: goal(opp),
        expected: `A reply from ${opp.business.name} within ${lastDay} days`,
        evidence: [opp.angle, ...opp.evidence, `Email published at ${opp.contact.emailSourceUrl}`].filter(Boolean).slice(0, 5),
      },
      idempotencyKey: pitchKey(opp),
      opportunityId: opp.id,
    });
    return { actionId: action.id };
  }

  async function draftFollowUp(opportunityId, { inReplyTo = '' } = {}) {
    const opp = store.getOpportunity(opportunityId);
    if (!['pitched', 'following_up'].includes(opp?.stage)) return { skipped: 'not waiting on a reply' };
    const number = opp.followUpsSent + 1;
    const { email, needsReview } = await draft(FOLLOW_UP_SYSTEM, `${pitchBrief(opp, [])}\nEarlier subject: ${opp.subject}\nThis is follow-up ${number}.`, 600);
    const body = String(email.body ?? '').trim();
    if (!body) throw new Error('The follow-up draft came back empty.');
    const action = await registry.request({
      tool: 'email.follow_up',
      payload: {
        opportunityId: opp.id, business: opp.business.name, to: opp.contact.email, subject: replySubject(opp.subject),
        draft: body, threadId: opp.gmailThreadId, inReplyTo: inReplyTo || opp.lastMessageIdHeader, needsReview,
      },
      why: { goal: goal(opp), expected: `A reply from ${opp.business.name}`, evidence: [`No reply since ${String(opp.pitchedAt ?? '').slice(0, 10)}`, opp.angle].filter(Boolean) },
      idempotencyKey: `followup:${opp.id}:${number}`,
      opportunityId: opp.id,
    });
    return { actionId: action.id };
  }

  async function draftPortfolioReply(opportunityId, { style = '', request = '', inReplyTo = '' } = {}) {
    const opp = store.getOpportunity(opportunityId);
    if (opp?.stage !== 'replied') return { skipped: 'no reply to answer' };
    const pieces = portfolio.match({ lane: opp.lane, style, location: opp.business.location }).map((match) => match.item);
    const { email, needsReview } = await draft(PORTFOLIO_SYSTEM, `${pitchBrief(opp, pieces)}\nTheir request: ${request}`, 800);
    const body = String(email.body ?? '').trim();
    if (!body) throw new Error('The portfolio reply draft came back empty.');
    const action = await registry.request({
      tool: 'email.portfolio',
      payload: {
        opportunityId: opp.id, business: opp.business.name, to: opp.contact.email, subject: replySubject(opp.subject),
        draft: body, threadId: opp.gmailThreadId, inReplyTo, portfolioIds: pieces.map((piece) => piece.id), needsReview,
      },
      why: { goal: goal(opp), expected: `${opp.business.name} asks about dates or price`, evidence: [`They asked: ${request}`.slice(0, 200)] },
      idempotencyKey: `portfolio:${opp.id}:${inReplyTo || opp.version}`,
      opportunityId: opp.id,
      urgent: true,
    });
    return { actionId: action.id };
  }

  return { draftPitch, draftFollowUp, draftPortfolioReply };
}
