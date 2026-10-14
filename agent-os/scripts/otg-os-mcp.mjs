// Read-only OTG-OS MCP server (stdio) for desktop assistants such as Hermes.
// It exposes status, approvals, spend, autonomy and recent actions. Approvals stay in Telegram,
// so nothing here can approve, send, spend or change settings.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createOsRuntime } from '../lib/os/runtime.js';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(projectDir);
const envFile = path.join(projectDir, '.env.local');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

// Stdout belongs to the MCP protocol, so all logging goes to stderr.
const runtime = createOsRuntime({ log: (line) => console.error(line) });
const server = new McpServer({ name: 'otg-os', version: '1.0.0' });

const asText = (value) => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });

server.tool('otg_status', 'Whether OTG-OS is running or paused, approvals waiting, failures and this month\'s AI spend.', {}, async () =>
  asText({ summary: runtime.bot ? runtime.bot.statusText() : 'Telegram is not configured.', paused: runtime.settings.get('os.paused') }));

server.tool('otg_pending_approvals', 'Actions waiting for Jack to approve, edit or reject in Telegram.', {}, async () =>
  asText(await runtime.chat.runTool('list_pending_approvals', {})));

server.tool('otg_recent_actions', 'The most recent actions in the OTG-OS ledger, with status and the reason each was taken.',
  { limit: z.number().int().min(1).max(20).default(10) },
  async ({ limit }) => asText(await runtime.chat.runTool('list_recent_actions', { limit })));

server.tool('otg_budget', 'Month-to-date AI and data spend against the monthly cap.', {}, async () =>
  asText(await runtime.chat.runTool('get_budget_status', {})));

server.tool('otg_autonomy_levels', 'What OTG-OS may do on its own (Ask, Tell or Silent) for each action type.', {}, async () =>
  asText(await runtime.chat.runTool('list_autonomy_levels', {})));

process.on('exit', () => runtime.close());
await server.connect(new StdioServerTransport());
