// Runs one Gig Engine pass by hand: portfolio import, one prospect search, research, and pitch drafts.
// Usage: npm run os:gigs-once -- winery   (lanes: travel, winery, wedding, real_estate)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LANES } from '../lib/os/gigs/constants.js';
import { createOsRuntime } from '../lib/os/runtime.js';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(projectDir);
const envFile = path.join(projectDir, '.env.local');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const lane = process.argv[2] ?? 'winery';
if (!LANES.includes(lane)) {
  console.error(`Lane must be one of: ${LANES.join(', ')}`);
  process.exit(1);
}

const runtime = createOsRuntime({ log: console.log });
try {
  console.log(JSON.stringify(await runtime.gigs.runOnce({ lane }), null, 2));
  console.log(`${await runtime.registry.flushPendingApprovals()} approval(s) sent to Telegram.`);
  if (!runtime.canEmail) {
    console.log('Email is not set up yet (GOOGLE_* keys, OTG_SENDER_EMAIL, OTG_BUSINESS_MAILING_ADDRESS), so no pitches were drafted.');
  }
} finally {
  runtime.close();
}
