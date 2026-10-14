// Grok live search over X and the web through xAI's Responses API.
// Server-side search tools run on xAI's side; we get back text plus citation links.

const SOURCE_TOOLS = { x: 'x_search', web: 'web_search' };

function collectText(output = []) {
  return output
    .filter((item) => item.type === 'message')
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === 'output_text')
    .map((part) => part.text)
    .join('\n')
    .trim();
}

function collectCitations(data) {
  const fromAnnotations = (data.output ?? [])
    .filter((item) => item.type === 'message')
    .flatMap((item) => item.content ?? [])
    .flatMap((part) => part.annotations ?? [])
    .map((annotation) => annotation.url)
    .filter(Boolean);
  const fromTopLevel = (data.citations ?? []).map((citation) => (typeof citation === 'string' ? citation : citation?.url)).filter(Boolean);
  return [...new Set([...fromAnnotations, ...fromTopLevel])];
}

export function createXaiSearch({ apiKey, model = 'grok-4.3', baseUrl = 'https://api.x.ai/v1', fetchImpl = fetch, timeoutMs = 120_000 }) {
  return {
    model,
    async search({ query, sources = ['x', 'web'] }) {
      const body = {
        model,
        input: [{ role: 'user', content: String(query) }],
        tools: sources.map((source) => ({ type: SOURCE_TOOLS[source] })),
      };
      const response = await fetchImpl(`${baseUrl}/responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`xAI search error ${response.status}: ${detail.slice(0, 300)}`);
      }
      const data = await response.json();
      const citations = collectCitations(data);
      return {
        text: collectText(data.output) || String(data.output_text ?? '').trim(),
        citations,
        model: data.model ?? model,
        sourcesUsed: Number(data.usage?.num_sources_used ?? citations.length),
        usage: {
          inputTokens: data.usage?.input_tokens ?? 0,
          outputTokens: data.usage?.output_tokens ?? 0,
          cacheReadTokens: data.usage?.input_tokens_details?.cached_tokens ?? 0,
          cacheWriteTokens: 0,
        },
      };
    },
  };
}
