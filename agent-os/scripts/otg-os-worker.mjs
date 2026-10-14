import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOsRuntime } from '../lib/os/runtime.js';
import { createWorker } from '../lib/os/worker.js';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(projectDir);
const envFile = path.join(projectDir, '.env.local');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const logDir = path.join(projectDir, 'data', 'logs');
fs.mkdirSync(logDir, { recursive: true });

function log(message) {
  const line = `${new Date().toISOString()} ${message}`;
  console.log(line);
  fs.appendFileSync(path.join(logDir, `otg-os-worker-${line.slice(0, 10)}.log`), `${line}\n`);
}

const runtime = createOsRuntime({ log });
const recovered = runtime.ledger.recoverInterrupted();
if (recovered) log(`Recovered ${recovered} interrupted action(s).`);
const worker = createWorker(runtime, { log });

let stopping = false;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function tickLoop() {
  while (!stopping) {
    const report = await worker.tick();
    if (report.executed || report.flushed || report.backup) log(`tick ${JSON.stringify(report)}`);
    await sleep(30_000);
  }
}

async function telegramLoop() {
  if (!runtime.bot) {
    log('Telegram is not configured: set TELEGRAM_BOT_TOKEN in .env.local.');
    return;
  }
  if (!Number(process.env.TELEGRAM_OWNER_ID)) log('TELEGRAM_OWNER_ID is missing: send /start to the bot to get your ID.');
  while (!stopping) {
    try {
      await runtime.bot.pollOnce(25);
    } catch (error) {
      log(`Telegram poll failed: ${error.message}`);
      await sleep(5_000);
    }
  }
}

function stop() {
  stopping = true;
  log('Stopping OTG-OS worker...');
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

log('OTG-OS worker started.');
await Promise.all([tickLoop(), telegramLoop()]);
runtime.close();
log('OTG-OS worker stopped.');
