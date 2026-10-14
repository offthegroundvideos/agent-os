import { utcDayStart, utcMonthStart } from './time.js';

export const MICROS_PER_CENT = 10_000;

export function formatDollars(micros) {
  return `$${(Number(micros) / 1_000_000).toFixed(2)}`;
}

export function createBudget({ db }, settings, { now = () => new Date() } = {}) {
  function priceFor(model) {
    return settings.get('models.prices')[model] ?? settings.get('models.unknown_price');
  }

  function costMicros(model, usage = {}) {
    const price = priceFor(model);
    return Math.round(
      (usage.inputTokens ?? 0) * price.input
      + (usage.outputTokens ?? 0) * price.output
      + (usage.cacheReadTokens ?? 0) * price.cacheRead
      + (usage.cacheWriteTokens ?? 0) * price.cacheWrite,
    );
  }

  function record({ provider, modelOrTool, taskType, tokensIn = 0, tokensOut = 0, units = 0, costMicros: cost = 0, actionId = null }) {
    db.prepare(`INSERT INTO spend (provider, model_or_tool, task_type, tokens_in, tokens_out, units, cost_micros, action_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(provider, modelOrTool, taskType, tokensIn, tokensOut, units, Math.round(cost), actionId, now().toISOString());
  }

  function monthToDateMicros() {
    return db.prepare('SELECT COALESCE(SUM(cost_micros), 0) AS total FROM spend WHERE created_at >= ?')
      .get(utcMonthStart(now())).total;
  }

  function status() {
    const spentMicros = monthToDateMicros();
    const capMicros = settings.get('budget.monthly_cap_cents') * MICROS_PER_CENT;
    const warningMicros = settings.get('budget.warning_cents') * MICROS_PER_CENT;
    const state = spentMicros >= capMicros ? 'capped' : spentMicros >= warningMicros ? 'warning' : 'ok';
    return { spentMicros, capMicros, warningMicros, state };
  }

  function canUsePaid() {
    return status().state !== 'capped';
  }

  function toolUnitsToday(tool) {
    return db.prepare('SELECT COALESCE(SUM(units), 0) AS total FROM spend WHERE model_or_tool = ? AND created_at >= ?')
      .get(tool, utcDayStart(now())).total;
  }

  function canUseTool(tool, units = 1) {
    if (!canUsePaid()) return false;
    const cap = settings.get('budget.daily_tool_caps')[tool];
    return cap == null || toolUnitsToday(tool) + units <= cap;
  }

  return { costMicros, record, monthToDateMicros, status, canUsePaid, toolUnitsToday, canUseTool };
}
