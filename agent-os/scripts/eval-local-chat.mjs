// Compares local Ollama models on the OTG-OS owner chat: correct tool use, factual answers, no invented facts, speed.
// Usage: node scripts/eval-local-chat.mjs qwen3.5:9b gemma4:latest
// Uses a throwaway in-memory database with known contents; costs nothing.
import { openOsDb } from '../lib/os/db.js';
import { createSettings } from '../lib/os/settings.js';
import { createLedger } from '../lib/os/ledger.js';
import { createBudget } from '../lib/os/budget.js';
import { createApprovalGate } from '../lib/os/approvalGate.js';
import { createOllamaProvider } from '../lib/os/providers/ollama.js';
import { createModelRouter } from '../lib/os/modelRouter.js';
import { createChat } from '../lib/os/brain/chat.js';

const CASES = [
  { question: 'Is anything waiting for my approval?', tool: 'list_pending_approvals', expect: [/\b2\b|two/i, /napa|winery|follow/i] },
  { question: 'How much have we spent on AI this month?', tool: 'get_budget_status', expect: [/12\.34/] },
  { question: 'Is OTG-OS paused right now?', tool: 'get_system_status', expect: [/not paused|isn.?t paused|running|is not|no,? /i] },
  { question: 'Can you send follow-up emails on your own yet?', tool: 'list_autonomy_levels', expect: [/ask|approv|not yet|no/i] },
  { question: 'What were the last 3 things in the ledger?', tool: 'list_recent_actions', expect: [/napa|winery|follow|demo|research/i] },
  { question: 'How many weddings did we book last month?', tool: null, expect: [/don.?t|do not|no (record|data|information)|can.?t|not (able|available|tracked)/i] },
];

function seed() {
  const osDb = openOsDb(':memory:');
  const settings = createSettings(osDb);
  const ledger = createLedger(osDb);
  const budget = createBudget(osDb, settings);
  const gate = createApprovalGate(osDb);
  budget.record({ provider: 'anthropic', modelOrTool: 'claude-sonnet-5-5', taskType: 'chat', costMicros: 12_340_000 });
  const why = (goal) => ({ goal, expected: 'Owner approves' });
  ledger.propose({ idempotencyKey: 'e1', actionType: 'email.follow_up', tool: 'email.follow_up', payload: { draft: 'Following up with Napa Valley Estate winery' }, why: why('Book a Napa winery preferred-vendor listing'), autonomyLevel: 'ask' });
  ledger.propose({ idempotencyKey: 'e2', actionType: 'email.follow_up', tool: 'email.follow_up', payload: { draft: 'Following up with a Mill Valley listing agent' }, why: why('Book a weekly real estate shoot'), autonomyLevel: 'ask' });
  ledger.propose({ idempotencyKey: 'e3', actionType: 'research.prospect_list', tool: 'research.prospect_list', payload: {}, why: why('Find Bora Bora resorts'), autonomyLevel: 'silent' });
  gate.levelFor('email.follow_up');
  return { osDb, settings, ledger, budget, gate };
}

async function evaluate(model) {
  const state = seed();
  const calls = [];
  const provider = createOllamaProvider();
  const tracked = { name: 'ollama', async complete(request) { const result = await provider.complete(request); calls.push(...result.content.filter((b) => b.type === 'tool_use').map((b) => b.name)); return result; } };
  const router = createModelRouter({ providers: { ollama: tracked }, budget: state.budget, routes: { chat: [{ provider: 'ollama', model }] } });
  const chat = createChat({ router, ...state });
  let score = 0;
  const rows = [];
  const started = Date.now();
  for (const testCase of CASES) {
    calls.length = 0;
    const t0 = Date.now();
    let answer;
    try { answer = await chat.ask(testCase.question); } catch (error) { answer = `ERROR ${error.message}`; }
    const toolOk = testCase.tool ? calls.includes(testCase.tool) : true;
    const factsOk = testCase.expect.every((pattern) => pattern.test(answer));
    const pass = toolOk && factsOk;
    if (pass) score += 1;
    rows.push(`  ${pass ? 'PASS' : 'FAIL'} ${((Date.now() - t0) / 1000).toFixed(1)}s  tools=[${calls.join(',')}]  Q: ${testCase.question}\n        A: ${answer.replace(/\s+/g, ' ').slice(0, 200)}`);
  }
  state.osDb.close();
  console.log(`\n${model}: ${score}/${CASES.length} passed, ${((Date.now() - started) / 1000).toFixed(0)}s total`);
  console.log(rows.join('\n'));
}

for (const model of process.argv.slice(2)) await evaluate(model);
