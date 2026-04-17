# Prospect Radar Discovery Worker

This worker finds public-web service-request posts and pushes them into Agent OS as:

- `recordType: "prospect_opportunity"`

It is designed for:
- future weddings like `Weddings 2027`
- festivals looking for photographers or videographers
- automotive requests like mechanics, body shops, and car repair work

Important boundary:
- public web and public results only
- no automation into private Facebook groups
- no automation into private Nextdoor neighborhoods
- use official APIs where available

## Worker File

- [C:\AI-Agents\agent-os\cloudflare\prospect-radar-discovery-worker.js](C:\AI-Agents\agent-os\cloudflare\prospect-radar-discovery-worker.js)
- [C:\AI-Agents\agent-os\cloudflare\wrangler.prospect-radar.example.toml](C:\AI-Agents\agent-os\cloudflare\wrangler.prospect-radar.example.toml)

## Required Worker Env Vars

- `AGENT_OS_BASE_URL`
- `CLOUDFLARE_INGEST_SECRET`
- `FIRECRAWL_API_KEY`

Example:

```text
AGENT_OS_BASE_URL=https://your-agent-os-domain
CLOUDFLARE_INGEST_SECRET=your_shared_secret
FIRECRAWL_API_KEY=your_firecrawl_key
```

## Wrangler Deploy Setup

1. Install Wrangler if needed:

```powershell
npm install -g wrangler
```

2. Log in:

```powershell
wrangler login
```

3. In [C:\AI-Agents\agent-os\cloudflare](C:\AI-Agents\agent-os\cloudflare), copy:

```text
wrangler.prospect-radar.example.toml
```

to:

```text
wrangler.toml
```

4. Edit `wrangler.toml` and set:

```toml
name = "prospect-radar-discovery"
main = "prospect-radar-discovery-worker.js"
compatibility_date = "2026-04-08"

[vars]
AGENT_OS_BASE_URL = "https://your-agent-os-domain"
```

5. Set secrets:

```powershell
wrangler secret put CLOUDFLARE_INGEST_SECRET
wrangler secret put FIRECRAWL_API_KEY
```

6. Deploy:

```powershell
Set-Location C:\AI-Agents\agent-os\cloudflare
wrangler deploy
```

7. Copy the deployed worker URL and set it in Agent OS:

```text
PROSPECT_RADAR_DISCOVERY_URL=https://your-worker-url.workers.dev
```

8. Restart Agent OS.

## Agent OS Launcher Env Var

To launch discovery directly from the `PROSPECT RADAR` panel, set this in Agent OS:

```text
PROSPECT_RADAR_DISCOVERY_URL=https://your-cloudflare-worker-url
```

Example:

```text
PROSPECT_RADAR_DISCOVERY_URL=https://prospect-radar-discovery.your-subdomain.workers.dev
```

## What It Does

1. Accepts a category/niche/location/year payload
2. Builds public search queries
3. Calls Firecrawl search
4. Normalizes results into `prospect_opportunity` records
5. Sends those records to:

- `POST /api/cloudflare-ingest`

Agent OS then stores them in Prospect Radar.

## Example Request

### Weddings 2027

```json
{
  "category": "weddings",
  "niche": "wedding photography",
  "location": "Orange County, CA",
  "year": "2027",
  "limit": 8
}
```

### Festivals

```json
{
  "category": "festivals",
  "niche": "festival photographer videographer",
  "location": "San Diego, CA",
  "year": "2027",
  "limit": 8
}
```

### Automotive

```json
{
  "category": "automotive",
  "niche": "car repair mechanic body shop",
  "location": "Austin, TX",
  "limit": 8
}
```

## Example Normalized Record

```json
{
  "recordType": "prospect_opportunity",
  "title": "Need a festival videographer for summer 2027 in San Diego",
  "niche": "festival videography",
  "requestedService": "festival videographer",
  "sourcePlatform": "public-web",
  "sourceLabel": "eventboard.example.com",
  "sourceUrl": "https://example.com/festival-opportunity",
  "location": "San Diego, CA",
  "postedAt": "2026-04-08T11:00:00Z",
  "summary": "Planning a summer 2027 festival and looking for photo/video coverage.",
  "outreachAngle": "Lead with event coverage proof and confirm future-date availability.",
  "queryUsed": "\"festival photographer videographer 2027\" (\"hiring photographer\" OR \"need videographer\" OR \"media team\") festival San Diego, CA",
  "discoveredFrom": "firecrawl-search"
}
```

## How It Shows Up In Agent OS

After ingest, go to:

- `TOOLS`
- `PROSPECT RADAR`

From there you can:
- open the source post
- mark it actioned
- save it into the lead-prospect queue
- archive it

## Good First Runs

1. `Weddings 2027`
2. `Festival photographer videographer 2027`
3. `Need mechanic` plus a target city
4. `Body shop recommendation` plus a target city

## Next Good Upgrades

1. Add scheduled Cloudflare runs by category and city
2. Add source-specific scoring rules
3. Add screenshot capture for better operator review
4. Add a route to launch discovery jobs from Agent OS directly
