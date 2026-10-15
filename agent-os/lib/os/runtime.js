import path from 'node:path';
import { openOsDb } from './db.js';
import { createSettings } from './settings.js';
import { createLedger } from './ledger.js';
import { createBudget } from './budget.js';
import { createApprovalGate } from './approvalGate.js';
import { createAnthropicProvider } from './providers/anthropic.js';
import { createOllamaProvider } from './providers/ollama.js';
import { createOpenAiChatProvider } from './providers/openaiChat.js';
import { createXaiSearch } from './providers/xaiSearch.js';
import { createLiveSearch } from './tools/liveSearch.js';
import { createModelRouter } from './modelRouter.js';
import { createRegistry } from './registry.js';
import { demoTool } from './tools/demo.js';
import { createTelegramApi } from './telegram/api.js';
import { createConsoleNotifier, createTelegramNotifier } from './telegram/notifier.js';
import { createTelegramBot } from './telegram/bot.js';
import { createApprovalActions } from './approvalActions.js';
import { createDashboard } from './dashboard.js';
import { createSettingsEditor } from './settingsEditor.js';
import { createRedrafter } from './redraft.js';
import { createWeeklyReport } from './weeklyReport.js';
import { createTeam } from './team.js';
import { createChat } from './brain/chat.js';
import { createHeartbeat } from './heartbeat.js';
import { createBackup } from './backup.js';
import { createGigStore } from './gigs/store.js';
import { createStages } from './gigs/stages.js';
import { createSiteFetch } from './gigs/siteFetch.js';
import { createProspectFinder } from './gigs/prospectFinder.js';
import { createProspectResearch } from './gigs/prospectResearch.js';
import { createOutreach } from './gigs/outreach.js';
import { createReplyTriage } from './gigs/replyTriage.js';
import { createGigEngine } from './gigs/engine.js';
import { createPortfolioStore } from './portfolio/store.js';
import { createPortfolio } from './portfolio/index.js';
import { createGmail } from './tools/gmail.js';
import { createEmailTools } from './tools/email.js';

export function createOsRuntime({
  env = process.env,
  cwd = process.cwd(),
  fetchImpl = fetch,
  anthropicClient = null,
  now = () => new Date(),
  log = console.log,
} = {}) {
  const osDb = openOsDb(env.OTG_OS_DB_FILE || path.join(cwd, 'data', 'otg-os.sqlite'));
  const settings = createSettings(osDb);
  const ledger = createLedger(osDb, { now });
  const budget = createBudget(osDb, settings, { now });
  const gate = createApprovalGate(osDb, { now });

  const providers = { ollama: createOllamaProvider({ baseUrl: env.OLLAMA_URL || 'http://localhost:11434', fetchImpl }) };
  if (anthropicClient || env.ANTHROPIC_API_KEY) {
    providers.anthropic = createAnthropicProvider({ client: anthropicClient ?? undefined, apiKey: env.ANTHROPIC_API_KEY });
  }
  if (env.DEEPSEEK_API_KEY) {
    providers.deepseek = createOpenAiChatProvider({
      name: 'deepseek',
      baseUrl: 'https://api.deepseek.com',
      apiKey: env.DEEPSEEK_API_KEY,
      fetchImpl,
      extraBody: { thinking: { type: 'disabled' } },
    });
  }
  const router = createModelRouter({ providers, budget });
  const liveSearch = env.XAI_API_KEY
    ? createLiveSearch({ xai: createXaiSearch({ apiKey: env.XAI_API_KEY, fetchImpl }), budget, settings })
    : null;

  const ownerId = Number(env.TELEGRAM_OWNER_ID) || null;
  const api = env.TELEGRAM_BOT_TOKEN ? createTelegramApi({ token: env.TELEGRAM_BOT_TOKEN, fetchImpl }) : null;
  const team = createTeam({ settings, ownerId, ownerName: env.TELEGRAM_OWNER_NAME || 'Jack' });
  const notifier = api && ownerId ? createTelegramNotifier({ api, team, log }) : createConsoleNotifier(log);

  const registry = createRegistry({ ledger, gate, settings, notifier, now });
  registry.register(demoTool);

  const gigStore = createGigStore(osDb, { now });
  const stages = createStages(osDb, { now });
  const portfolio = createPortfolio({
    store: createPortfolioStore(osDb, { now }), router, budget, settings, scrapeCreatorsKey: env.SCRAPECREATORS_API_KEY || '', fetchImpl, now,
  });
  const gmail = env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REFRESH_TOKEN
    ? createGmail({ clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, refreshToken: env.GOOGLE_REFRESH_TOKEN, fetchImpl, now })
    : null;
  // Outreach needs Gmail, a sender address and the CAN-SPAM mailing address. Without all three nothing is drafted.
  const canEmail = Boolean(gmail && env.OTG_SENDER_EMAIL && env.OTG_BUSINESS_MAILING_ADDRESS);
  if (canEmail) {
    const emailTools = createEmailTools({
      gmail, store: gigStore, stages, settings, senderEmail: env.OTG_SENDER_EMAIL, mailingAddress: env.OTG_BUSINESS_MAILING_ADDRESS, notifier, now, log,
    });
    for (const tool of emailTools) registry.register(tool);
  }
  const outreach = createOutreach({ router, store: gigStore, portfolio, registry, settings });
  const gigs = createGigEngine({
    settings,
    store: gigStore,
    stages,
    portfolio,
    finder: liveSearch ? createProspectFinder({ liveSearch, router, store: gigStore, settings }) : null,
    research: createProspectResearch({ siteFetch: createSiteFetch({ fetchImpl }), router, store: gigStore, stages, portfolio }),
    outreach,
    triage: canEmail ? createReplyTriage({ gmail, store: gigStore, stages, router, outreach, notifier, settings, now, log }) : null,
    gmail,
    canEmail,
    now,
    log,
  });

  const approvals = createApprovalActions({ ledger, registry, api, log });
  const settingsEditor = createSettingsEditor({ settings });
  const redrafter = createRedrafter({ router, ledger });
  const weekly = createWeeklyReport({ osDb, settings, now });
  const dashboard = createDashboard({
    osDb, settings, ledger, budget, approvals, gigStore, stages, portfolio, team, logDir: path.join(cwd, 'data', 'logs'), now,
  });
  const chat = createChat({ router, ledger, budget, gate, settings, liveSearch, dashboard, settingsEditor });
  const bot = api ? createTelegramBot({ api, team, settings, ledger, registry, gate, budget, chat, gigs, log, approvals }) : null;
  const heartbeat = createHeartbeat({ url: env.HEALTHCHECKS_PING_URL || '', fetchImpl });
  const backup = createBackup({ osDb, dir: env.OTG_OS_BACKUP_DIR || path.join(cwd, 'data', 'backups', 'otg-os'), now });

  return {
    osDb, settings, ledger, budget, gate, router, providers, liveSearch, registry, notifier, team, chat, approvals, bot, heartbeat, backup,
    gigStore, stages, portfolio, gmail, canEmail, gigs, dashboard, settingsEditor, redrafter, weekly,
    close: () => osDb.close(),
  };
}
