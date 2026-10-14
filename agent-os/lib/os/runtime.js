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
import { createTeam } from './team.js';
import { createChat } from './brain/chat.js';
import { createHeartbeat } from './heartbeat.js';
import { createBackup } from './backup.js';

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

  const chat = createChat({ router, ledger, budget, gate, settings, liveSearch });
  const bot = api ? createTelegramBot({ api, team, settings, ledger, registry, gate, budget, chat, log }) : null;
  const heartbeat = createHeartbeat({ url: env.HEALTHCHECKS_PING_URL || '', fetchImpl });
  const backup = createBackup({ osDb, dir: env.OTG_OS_BACKUP_DIR || path.join(cwd, 'data', 'backups', 'otg-os'), now });

  return {
    osDb, settings, ledger, budget, gate, router, providers, liveSearch, registry, notifier, team, chat, bot, heartbeat, backup,
    close: () => osDb.close(),
  };
}
