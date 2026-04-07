import fs from 'fs';
import path from 'path';

const JOBS_FILE = path.join(process.cwd(), 'data', 'autojobs.json');

function ensureFile() {
  const dir = path.dirname(JOBS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(JOBS_FILE)) {
    fs.writeFileSync(JOBS_FILE, JSON.stringify({
      settings: { mode: 'manual' },
      jobs: [],
      results: [],
      lastRun: null,
    }, null, 2));
  }
}

// Load recent pipeline topics for context-aware lead generation
function getRecentTopics() {
  try {
    const commsFile = path.join(process.cwd(), 'data', 'comms.json');
    if (!fs.existsSync(commsFile)) return [];
    const data = JSON.parse(fs.readFileSync(commsFile, 'utf-8'));
    const topics = (data.sessions || [])
      .filter(s => s.topic)
      .map(s => s.topic)
      .slice(0, 5);
    return [...new Set(topics)];
  } catch { return []; }
}

// Build dynamic lead gen prompt based on recent pipeline topics
function buildLeadGenPrompt() {
  const topics = getRecentTopics();
  const topicContext = topics.length > 0
    ? `\n\nRECENT PIPELINE TOPICS (generate leads related to these):\n${topics.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n`
    : '\nFocus on: wedding photography, music video production, real estate videography, corporate events, restaurant/food content\n';

  return `You are Luna, OTG Icon's lead qualifier. Run an autonomous lead generation scan.
${topicContext}
For each of the topics above, generate 2 detailed potential client leads (${Math.max(5, topics.length * 2)} total).

For EACH lead provide a FULL DETAIL REPORT:
1. **Business Name** — realistic business name for the niche
2. **Industry/Niche** — what they do
3. **Why They Need OTG** — specific pain point OTG solves for them
4. **Service Recommendation** — which OTG package fits (video production, photography, social content, full brand package)
5. **Estimated Budget** — realistic range based on business size
6. **Timeline** — when they likely need it (urgent, 1-2 weeks, 1-3 months)
7. **Temperature** — HOT (ready to buy), WARM (interested, needs nurturing), COLD (potential, needs education)
8. **Decision Maker** — who to contact (owner, marketing director, event planner, etc.)
9. **Best Approach** — exactly how to reach and pitch them (DM, email, call, in-person, referral)
10. **Personalized Outreach Message** — a ready-to-send message tailored to this specific lead
11. **Objection Prediction** — what they'll push back on and how to handle it
12. **Upsell Opportunity** — what additional OTG service they'd buy after the first project

End with [QUALIFIED] and this JSON:
{"leads_found":0,"hot_leads":0,"warm_leads":0,"cold_leads":0,"top_lead_niche":"","topics_covered":[],"recommended_action":"","total_estimated_revenue":""}`;
}

// Default background tasks agents can do when idle
export const AUTO_JOBS = {
  luna: {
    name: 'Lead Generation Scan',
    interval: 30, // minutes
    get prompt() { return buildLeadGenPrompt(); },
  },
  rex: {
    name: 'Sales Follow-Up Generator',
    interval: 45,
    get prompt() {
      const topics = getRecentTopics();
      const topicStr = topics.length > 0 ? topics.join(', ') : 'video production and photography services';
      return `You are Rex, OTG Icon's sales agent. Generate follow-up sequences for recent leads.

Based on these active niches: ${topicStr}

Create:
1. A 3-step email follow-up sequence for a HOT lead (ready to buy) — each email under 100 words
2. A 3-step nurture sequence for a WARM lead — each message builds value before the ask
3. One "re-engagement" message for a lead that went cold
4. A pricing objection response that reframes value
5. A "social proof" message using OTG's work (reference real creative work — weddings, music videos, Mardi Gras, etc.)

For each message include:
- Subject line
- Body (concise, conversational)
- CTA (specific next step)
- Best send time/day

End with [PROPOSAL_COMPLETE] and this JSON:
{"sequences_created":3,"total_messages":0,"niches_covered":[],"estimated_close_rate":""}`;
    },
  },
  alex: {
    name: 'Market Intelligence Sweep',
    interval: 60,
    prompt: `You are Alex, OTG Icon's market intelligence agent. Run an autonomous market scan.

Do the following:
1. Identify 3 trending content formats right now for visual creators on Instagram Reels and TikTok
2. Name 2 emerging niches where videography/photography businesses are growing
3. Spot 1 competitive gap — something clients want but most agencies don't offer
4. Give 1 specific content idea OTG could film THIS WEEK based on trends

Keep it under 300 words. Be specific with real formats and trends, not generic advice.

End with [RESEARCH_COMPLETE] and this JSON:
{"trending_formats":[],"emerging_niches":[],"competitive_gap":"","content_idea":"","urgency":""}`,
  },
  jordan: {
    name: 'Growth Opportunity Check',
    interval: 120,
    prompt: `You are Jordan, OTG Icon's growth strategist. Run an autonomous growth check.

Analyze:
1. What is ONE specific thing OTG should focus on this week to get more clients?
2. What is ONE upsell opportunity for existing clients?
3. Suggest a quick-win marketing action that takes under 2 hours

Keep it under 200 words. Be extremely specific and actionable.

End with [STRATEGY_COMPLETE] and this JSON:
{"focus_area":"","upsell_idea":"","quick_win":"","estimated_impact":""}`,
  },
  pixel: {
    name: 'Brand & Product Ideas',
    interval: 180,
    prompt: `You are Pixel, OTG Icon's brand strategist. Generate fresh product/brand ideas.

Create:
1. One new merch concept that fits OTG Icon's New Orleans / Mardi Gras Indian aesthetic
2. One content series idea that showcases OTG's unique style
3. One collaboration opportunity with a local brand or artist

Keep it under 200 words.

End with a brief JSON summary: {"merch_concept":"","series_idea":"","collab_opportunity":""}`,
  },
  cto: {
    name: 'System Health & Update Check',
    interval: 60,
    prompt: `You are Arch, OTG Icon's CTO. Run an autonomous system health check and update scan.

Review the following systems and report status:
1. **Agent OS** (Next.js 14 on port 4000) — check for outdated dependencies, performance issues, and any code improvements needed
2. **Ollama** (port 11434) — check model availability, GPU utilization, and if any models need updates
3. **DeerFlow** (Docker on port 2026) — container health, config drift, and update availability
4. **n8n Workflows** — automation health and any broken webhook connections
5. **Data Files** — check if JSON data files (memory, learning, comms) are growing too large or have corruption risk

For each system provide:
- STATUS: GREEN (healthy) / YELLOW (needs attention) / RED (broken)
- ISSUE: what's wrong or could be improved (if any)
- FIX: specific action to resolve it
- PRIORITY: critical / high / medium / low

Also identify:
- Any security concerns (exposed keys, missing auth, etc.)
- Performance bottlenecks (slow endpoints, GPU contention patterns)
- Recommended software updates with risk level

End with JSON: {"systems_checked":0,"green":0,"yellow":0,"red":0,"critical_issues":0,"updates_available":[],"recommended_action":""}`,
  },
  ceo: {
    name: 'Executive Business Review',
    interval: 240,
    get prompt() {
      const topics = getRecentTopics();
      const topicStr = topics.length > 0
        ? `Recent pipeline topics: ${topics.join(', ')}`
        : 'No recent pipeline activity.';
      return `You are Chief, OTG Icon's CEO. Run an autonomous business review.

${topicStr}

Provide an executive briefing:

1. **BUSINESS HEALTH** — One sentence assessment of where OTG stands right now
2. **REVENUE OPPORTUNITIES** — Based on recent pipeline activity, what are the top 3 revenue-generating actions we should take THIS WEEK?
3. **TEAM UTILIZATION** — Are all agents being used effectively? Which agents are underutilized and what should they be doing?
4. **CLIENT PIPELINE** — Based on the leads Luna has generated and proposals Rex has written, what is the status of our sales pipeline?
5. **RISKS** — What are the top 2 things that could hurt the business right now?
6. **DECISIONS NEEDED** — What decisions need to be made by the team TODAY?
7. **WEEKLY PRIORITY** — The ONE thing the entire team should focus on this week

Keep it under 400 words. Think like a CEO: revenue-focused, decisive, no fluff.

End with JSON: {"business_health":"green/yellow/red","top_priority":"","revenue_target":"","risks":[],"decisions_needed":[],"underutilized_agents":[]}`;
    },
  },
};

export function loadJobs() {
  ensureFile();
  try {
    const data = JSON.parse(fs.readFileSync(JOBS_FILE, 'utf-8'));
    return {
      settings: { mode: data?.settings?.mode === 'idle' ? 'idle' : 'manual' },
      jobs: Array.isArray(data?.jobs) ? data.jobs : [],
      results: Array.isArray(data?.results) ? data.results : [],
      lastRun: data?.lastRun || null,
    };
  } catch {
    return {
      settings: { mode: 'manual' },
      jobs: [],
      results: [],
      lastRun: null,
    };
  }
}

export function saveJobs(data) {
  ensureFile();
  fs.writeFileSync(JOBS_FILE, JSON.stringify(data, null, 2));
}

export function getAutoJobSettings() {
  return loadJobs().settings || { mode: 'manual' };
}

export function updateAutoJobSettings(nextSettings = {}) {
  const data = loadJobs();
  const mode = nextSettings.mode === 'idle' ? 'idle' : 'manual';
  data.settings = { ...data.settings, mode };
  saveJobs(data);
  return data.settings;
}

export function autoJobsCanRunInBackground() {
  return getAutoJobSettings().mode === 'idle';
}

export function getJobsDue() {
  if (!autoJobsCanRunInBackground()) return [];
  const data = loadJobs();
  const now = Date.now();
  const due = [];

  for (const [agentId, job] of Object.entries(AUTO_JOBS)) {
    const lastRun = data.jobs.find(j => j.agentId === agentId)?.lastRun;
    const elapsed = lastRun ? (now - new Date(lastRun).getTime()) / 60000 : Infinity;
    if (elapsed >= job.interval) {
      due.push({ agentId, ...job });
    }
  }
  return due;
}

export function markJobRun(agentId) {
  const data = loadJobs();
  const existing = data.jobs.find(j => j.agentId === agentId);
  if (existing) {
    existing.lastRun = new Date().toISOString();
    existing.runCount = (existing.runCount || 0) + 1;
  } else {
    data.jobs.push({ agentId, lastRun: new Date().toISOString(), runCount: 1 });
  }
  data.lastRun = new Date().toISOString();
  saveJobs(data);
}

export function saveJobResult(agentId, jobName, output) {
  const data = loadJobs();
  data.results = data.results || [];
  data.results.push({
    agentId,
    jobName,
    output: output.substring(0, 2000),
    timestamp: new Date().toISOString(),
  });
  // Keep last 50 results
  if (data.results.length > 50) data.results = data.results.slice(-50);
  saveJobs(data);
}

export function getJobResults(agentId) {
  const data = loadJobs();
  if (agentId) return (data.results || []).filter(r => r.agentId === agentId);
  return data.results || [];
}

export function getJobStatus() {
  const data = loadJobs();
  const now = Date.now();
  const jobs = Object.entries(AUTO_JOBS).map(([agentId, job]) => {
    const record = data.jobs.find(j => j.agentId === agentId);
    const lastRun = record?.lastRun ? new Date(record.lastRun) : null;
    const elapsed = lastRun ? Math.round((now - lastRun.getTime()) / 60000) : null;
    const isDue = autoJobsCanRunInBackground() && (elapsed === null || elapsed >= job.interval);
    return {
      agentId,
      jobName: job.name,
      interval: job.interval,
      lastRun: record?.lastRun || null,
      runCount: record?.runCount || 0,
      minutesSinceRun: elapsed,
      isDue,
      nextRunIn: isDue ? 0 : job.interval - elapsed,
    };
  });
  jobs.settings = data.settings || { mode: 'manual' };
  return jobs;
}
