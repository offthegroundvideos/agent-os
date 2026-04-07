# Cloudflare Worker Ingest Example

Use this pattern in a Cloudflare Worker to forward normalized crawl results into Agent OS.

## Endpoint

- `POST https://your-agent-os-domain/api/cloudflare-ingest`
- Optional header: `x-ingest-secret: <CLOUDFLARE_INGEST_SECRET>`

## Example Worker

```js
export default {
  async fetch(request, env) {
    const record = {
      recordType: 'viral_research',
      platform: 'tiktok',
      url: 'https://www.tiktok.com/@creator/video/1234567890',
      creatorHandle: '@creator',
      topic: 'dog training',
      cta: 'Book a consultation',
      publishedAt: new Date().toISOString(),
      source: 'cloudflare-worker',
    };

    const response = await fetch(`${env.AGENT_OS_BASE_URL}/api/cloudflare-ingest`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-ingest-secret': env.CLOUDFLARE_INGEST_SECRET || '',
      },
      body: JSON.stringify({ record }),
    });

    return new Response(await response.text(), {
      status: response.status,
      headers: { 'content-type': 'application/json' },
    });
  },
};
```

## Record Types

### `viral_research`

```json
{
  "recordType": "viral_research",
  "platform": "tiktok",
  "url": "https://www.tiktok.com/@creator/video/1234567890",
  "creatorHandle": "@creator",
  "topic": "dog training",
  "cta": "Book a consultation",
  "publishedAt": "2026-03-31T18:00:00Z",
  "source": "cloudflare-worker"
}
```

### `lead_prospect`

```json
{
  "recordType": "lead_prospect",
  "businessName": "Happy Paws Dog Training",
  "website": "https://happypaws.example.com",
  "email": "owner@happypaws.example.com",
  "phone": "+1-555-0100",
  "niche": "dog training",
  "geography": "Orange County, CA",
  "source": "cloudflare-worker"
}
```

## Notes

- Keep viral research and lead scraping in separate records.
- Agent OS upserts by canonical identity so repeated sends update instead of duplicating.
- The `CLOUD OPS` panel in Agent OS shows recent records and ingest events from this endpoint.
