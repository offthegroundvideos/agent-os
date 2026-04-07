export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const body = await request.json();

    const response = await fetch(`${env.AGENT_OS_BASE_URL}/api/cloudflare-ingest`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-ingest-secret': env.CLOUDFLARE_INGEST_SECRET,
      },
      body: JSON.stringify(body),
    });

    return new Response(await response.text(), {
      status: response.status,
      headers: { 'content-type': 'application/json' },
    });
  },
};
