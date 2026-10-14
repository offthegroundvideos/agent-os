const THINK_BLOCK = /<think>[\s\S]*?<\/think>\s*/g;

let toolCallCounter = 0;

function textOf(blocks = []) {
  return blocks
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

// Converts Anthropic-style messages (text, tool_use and tool_result blocks) into Ollama chat messages.
function toOllamaMessages(system, messages) {
  const out = system ? [{ role: 'system', content: system }] : [];
  const toolNames = new Map();
  for (const message of messages) {
    if (typeof message.content === 'string') {
      out.push({ role: message.role, content: message.content });
      continue;
    }
    const blocks = message.content ?? [];
    if (message.role === 'assistant') {
      const toolUses = blocks.filter((block) => block.type === 'tool_use');
      for (const block of toolUses) toolNames.set(block.id, block.name);
      out.push({
        role: 'assistant',
        content: textOf(blocks),
        ...(toolUses.length ? { tool_calls: toolUses.map((block) => ({ function: { name: block.name, arguments: block.input ?? {} } })) } : {}),
      });
      continue;
    }
    const results = blocks.filter((block) => block.type === 'tool_result');
    for (const result of results) {
      out.push({
        role: 'tool',
        tool_name: toolNames.get(result.tool_use_id) ?? '',
        content: typeof result.content === 'string' ? result.content : JSON.stringify(result.content),
      });
    }
    const text = textOf(blocks);
    if (text || !results.length) out.push({ role: message.role, content: text });
  }
  return out;
}

function toOllamaTools(tools = []) {
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

export function createOllamaProvider({ baseUrl = 'http://localhost:11434', fetchImpl = fetch, timeoutMs = 300_000 } = {}) {
  return {
    name: 'ollama',
    async complete({ model, system, messages, tools, maxTokens = 2048 }) {
      const body = {
        model,
        stream: false,
        think: false,
        keep_alive: '10m',
        options: { num_predict: maxTokens },
        messages: toOllamaMessages(system, messages),
        ...(tools?.length ? { tools: toOllamaTools(tools) } : {}),
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
      const usage = { inputTokens: data.prompt_eval_count ?? 0, outputTokens: data.eval_count ?? 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
      const toolCalls = data.message?.tool_calls ?? [];
      if (toolCalls.length) {
        toolCallCounter += 1;
        const content = [
          ...(text ? [{ type: 'text', text }] : []),
          ...toolCalls.map((call, index) => ({
            type: 'tool_use',
            id: `ollama_${Date.now()}_${toolCallCounter}_${index}`,
            name: call.function?.name,
            input: parseArguments(call.function?.arguments),
          })),
        ];
        return { text, content, stopReason: 'tool_use', model, usage };
      }
      if (!text) throw new Error('Ollama returned an empty response');
      return { text, content: [{ type: 'text', text }], stopReason: 'end_turn', model, usage };
    },
  };
}
