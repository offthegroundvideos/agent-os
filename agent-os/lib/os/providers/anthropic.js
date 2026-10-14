import Anthropic from '@anthropic-ai/sdk';

export const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-sonnet-5-5']);

export function normalizeAnthropicResponse(response) {
  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
  return {
    text,
    content: response.content,
    stopReason: response.stop_reason,
    model: response.model,
    usage: {
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      cacheReadTokens: response.usage?.cache_read_input_tokens ?? 0,
      cacheWriteTokens: response.usage?.cache_creation_input_tokens ?? 0,
    },
  };
}

export function createAnthropicProvider({ client, apiKey } = {}) {
  const anthropic = client ?? new Anthropic({ apiKey });
  return {
    name: 'anthropic',
    async complete({ model, system, messages, tools, maxTokens = 16000, effort }) {
      const params = { model, max_tokens: maxTokens, messages };
      if (system) params.system = system;
      if (tools?.length) params.tools = tools;
      if (effort) params.output_config = { effort };
      const response = FALLBACK_MODELS.has(model)
        ? await anthropic.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
        : await anthropic.messages.create(params);
      return normalizeAnthropicResponse(response);
    },
  };
}
