const THINK_BLOCK = /<think>[\s\S]*?<\/think>\s*/g;

function flatten(content) {
  if (typeof content === 'string') return content;
  return (content ?? [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

export function createOllamaProvider({ baseUrl = 'http://localhost:11434', fetchImpl = fetch, timeoutMs = 300_000 } = {}) {
  return {
    name: 'ollama',
    async complete({ model, system, messages, maxTokens = 2048 }) {
      const body = {
        model,
        stream: false,
        think: false,
        keep_alive: '10m',
        options: { num_predict: maxTokens },
        messages: [
          ...(system ? [{ role: 'system', content: system }] : []),
          ...messages.map((message) => ({ role: message.role, content: flatten(message.content) })),
        ],
      };
      const response = await fetchImpl(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error(`Ollama error ${response.status}`);
      const data = await response.json();
      const text = String(data.message?.content ?? '').replace(THINK_BLOCK, '').trim();
      return {
        text,
        content: [{ type: 'text', text }],
        stopReason: 'end_turn',
        model,
        usage: { inputTokens: data.prompt_eval_count ?? 0, outputTokens: data.eval_count ?? 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      };
    },
  };
}
