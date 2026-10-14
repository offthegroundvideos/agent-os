export class RouterError extends Error {
  constructor(taskType, failures) {
    super(`No model could complete "${taskType}": ${failures.join('; ') || 'no routes'}`);
    this.name = 'RouterError';
    this.taskType = taskType;
    this.failures = failures;
  }
}

export const DEFAULT_ROUTES = Object.freeze({
  decision: [{ provider: 'anthropic', model: 'claude-sonnet-5-5' }],
  chat: [{ provider: 'anthropic', model: 'claude-sonnet-5-5', effort: 'low' }],
  draft: [
    { provider: 'anthropic', model: 'claude-sonnet-5-5' },
    { provider: 'ollama', model: 'qwen3.5:9b', needsReview: true },
  ],
  classify: [{ provider: 'anthropic', model: 'claude-haiku-5-5' }],
  bulk: [
    { provider: 'ollama', model: 'qwen3.5:9b' },
    { provider: 'anthropic', model: 'claude-haiku-5-5' },
  ],
  daily_audit: [{ provider: 'anthropic', model: 'claude-sonnet-5-5' }],
  sunday_audit: [
    { provider: 'anthropic', model: 'claude-opus-5-5' },
    { provider: 'anthropic', model: 'claude-sonnet-5-5' },
  ],
});

const FREE_PROVIDERS = new Set(['ollama']);

export function createModelRouter({ providers, budget, routes = DEFAULT_ROUTES }) {
  async function run(taskType, request, { actionId = null } = {}) {
    const chain = routes[taskType];
    if (!chain) throw new RouterError(taskType, [`unknown task type "${taskType}"`]);
    const failures = [];
    for (const route of chain) {
      const provider = providers[route.provider];
      if (!provider) {
        failures.push(`${route.provider} not configured`);
        continue;
      }
      const paid = !FREE_PROVIDERS.has(route.provider);
      if (paid && !budget.canUsePaid()) {
        failures.push('monthly budget cap reached');
        continue;
      }
      try {
        const result = await provider.complete({ ...request, model: route.model, effort: request.effort ?? route.effort });
        const costMicros = paid ? budget.costMicros(result.model, result.usage) : 0;
        budget.record({
          provider: route.provider,
          modelOrTool: result.model,
          taskType,
          tokensIn: result.usage.inputTokens,
          tokensOut: result.usage.outputTokens,
          costMicros,
          actionId,
        });
        return { ...result, provider: route.provider, costMicros, needsReview: Boolean(route.needsReview) };
      } catch (error) {
        failures.push(`${route.provider}/${route.model}: ${error?.message ?? error}`);
      }
    }
    throw new RouterError(taskType, failures);
  }

  return { run };
}
