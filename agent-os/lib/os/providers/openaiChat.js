// OpenAI-compatible chat-completions provider (used for DeepSeek). Converts Anthropic-style
// messages and tools to the OpenAI format and back, so the router and chat loop stay unchanged.

function textOf(blocks = []) {
  return blocks
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

function toOpenAiMessages(system, messages) {
  const out = system ? [{ role: 'system', content: system }] : [];
  for (const message of messages) {
    if (typeof message.content === 'string') {
      out.push({ role: message.role, content: message.content });
      continue;
    }
    const blocks = message.content ?? [];
    if (message.role === 'assistant') {
      const toolUses = blocks.filter((block) => block.type === 'tool_use');
      const text = textOf(blocks);
      out.push({
        role: 'assistant',
        content: text || null,
        ...(toolUses.length ? {
          tool_calls: toolUses.map((block) => ({
            id: block.id,
            type: 'function',
            function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) },
          })),
        } : {}),
      });
      continue;
    }
    const results = blocks.filter((block) => block.type === 'tool_result');
    for (const result of results) {
      out.push({
        role: 'tool',
        tool_call_id: result.tool_use_id,
        content: typeof result.content === 'string' ? result.content : JSON.stringify(result.content),
      });
    }
    const text = textOf(blocks);
    if (text || !results.length) out.push({ role: message.role, content: text });
  }
  return out;
}

function toOpenAiTools(tools = []) {
  return tools.map((tool) => ({
    type: 'function',
    function: { name: tool.name, description: tool.description, parameters: tool.input_schema },
  }));
}

function parseArguments(value) {
  if (value && typeof value === 'object') return value;
  try {
    return JSON.parse(String(value || '{}'));
  } catch {
    return {};
  }
}

export function createOpenAiChatProvider({ name, baseUrl, apiKey, fetchImpl = fetch, timeoutMs = 120_000, extraBody = {} }) {
  return {
    name,
    async complete({ model, system, messages, tools, maxTokens = 4096 }) {
      const body = {
        model,
        max_tokens: maxTokens,
        messages: toOpenAiMessages(system, messages),
        ...extraBody,
        ...(tools?.length ? { tools: toOpenAiTools(tools) } : {}),
      };
      const response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`${name} error ${response.status}: ${detail.slice(0, 300)}`);
      }
      const data = await response.json();
      const message = data.choices?.[0]?.message ?? {};
      const cacheReadTokens = data.usage?.prompt_cache_hit_tokens ?? 0;
      const usage = {
        inputTokens: Math.max(0, (data.usage?.prompt_tokens ?? 0) - cacheReadTokens),
        outputTokens: data.usage?.completion_tokens ?? 0,
        cacheReadTokens,
        cacheWriteTokens: 0,
      };
      const text = String(message.content ?? '').trim();
      const toolCalls = message.tool_calls ?? [];
      if (toolCalls.length) {
        const content = [
          ...(text ? [{ type: 'text', text }] : []),
          ...toolCalls.map((call) => ({
            type: 'tool_use',
            id: String(call.id).replace(/[^A-Za-z0-9_-]/g, '_'),
            name: call.function?.name,
            input: parseArguments(call.function?.arguments),
          })),
        ];
        return { text, content, stopReason: 'tool_use', model: data.model ?? model, usage };
      }
      if (!text) throw new Error(`${name} returned an empty response`);
      return { text, content: [{ type: 'text', text }], stopReason: 'end_turn', model: data.model ?? model, usage };
    },
  };
}
