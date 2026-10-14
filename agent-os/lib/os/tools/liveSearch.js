// Budget-aware live search (Grok over X and the web). Each returned source is charged at
// budget.search_cost_micros_per_source, set above xAI's list price so spend is never under-counted.

const SOURCE_SETS = { x: ['x'], web: ['web'], both: ['x', 'web'] };

export function createLiveSearch({ xai, budget, settings }) {
  async function search({ query, sources = 'both' }, { actionId = null } = {}) {
    const selected = SOURCE_SETS[sources];
    if (!selected) return { error: 'sources must be x, web or both' };
    if (!budget.canUsePaid()) return { error: 'Monthly AI budget cap reached; live search is paused.' };
    const result = await xai.search({ query, sources: selected });
    const perSource = settings.get('budget.search_cost_micros_per_source');
    const costMicros = budget.costMicros(result.model, result.usage) + result.sourcesUsed * perSource;
    budget.record({
      provider: 'xai',
      modelOrTool: result.model,
      taskType: 'search',
      tokensIn: result.usage.inputTokens,
      tokensOut: result.usage.outputTokens,
      units: result.sourcesUsed,
      costMicros,
      actionId,
    });
    return { answer: result.text, links: result.citations.slice(0, 10), costMicros };
  }
  return { search };
}
