import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOsRuntime } from '../lib/os/runtime.js';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(projectDir);
const envFile = path.join(projectDir, '.env.local');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const runtime = createOsRuntime();
const action = await runtime.registry.request({
  tool: 'system.demo',
  payload: { draft: 'This is a test approval from OTG-OS. Tap Approve, Edit or Reject.' },
  why: {
    goal: 'Verify the Telegram approval loop',
    expected: 'Jack approves in Telegram and the worker marks this action done',
    evidence: ['Plan 1 acceptance check'],
  },
  idempotencyKey: `demo-${Date.now()}`,
  urgent: true,
});
console.log(`Created ${action.id} (${action.status}). Check Telegram.`);
runtime.close();
