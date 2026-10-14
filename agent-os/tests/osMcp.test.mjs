import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('the OTG-OS MCP server lists only read-only tools and answers them', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'otg-os-mcp-'));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--no-warnings', path.join(projectDir, 'scripts', 'otg-os-mcp.mjs')],
    env: { ...process.env, OTG_OS_DB_FILE: path.join(dir, 'os.sqlite'), TELEGRAM_BOT_TOKEN: '', XAI_API_KEY: '', DEEPSEEK_API_KEY: '' },
    stderr: 'ignore',
  });
  const client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(transport);
  try {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((tool) => tool.name).sort(), ['otg_autonomy_levels', 'otg_budget', 'otg_pending_approvals', 'otg_recent_actions', 'otg_status']);
    const budget = await client.callTool({ name: 'otg_budget', arguments: {} });
    assert.match(budget.content[0].text, /\$150\.00/);
    const pending = await client.callTool({ name: 'otg_pending_approvals', arguments: {} });
    assert.equal(JSON.parse(pending.content[0].text).length, 0);
  } finally {
    await client.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
