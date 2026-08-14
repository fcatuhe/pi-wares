---
name: exa-search
description: Web search and content extraction via Exa's keyless MCP endpoint. No API key or browser required. Semantic search that returns page highlights with every result, so a follow-up fetch is often unnecessary. Use for searching documentation, facts, or any web content.
---

# Exa Search

Web search and content extraction using Exa's hosted MCP endpoint. Works without any API key (rate-limited by IP). No browser required.

## Setup

None required. Optionally, for unthrottled usage:

1. Create an account at https://dashboard.exa.ai (no credit card, $20 signup credits + $10 free credits/month)
2. Create an API key
3. Add to your shell profile:
   ```bash
   export EXA_API_KEY="your-api-key-here"
   ```

When the key is set, requests are metered against your credits. When credits run out, requests are blocked, never billed.

## Search

```bash
{baseDir}/search.js "query"        # Basic search (5 results)
{baseDir}/search.js "query" -n 10  # More results (max 20)
```

### Options

- `-n <num>` - Number of results (default: 5, max: 20)

No date filter: the endpoint only accepts `query` and `numResults`. For recent results, put recency in the query itself (e.g. "latest", "in 2026"). Queries work best as semantically rich descriptions of the ideal page, not just keywords.

Results include highlighted page excerpts, so a follow-up content fetch is often unnecessary.

## Extract Page Content

```bash
{baseDir}/content.js https://example.com/article
{baseDir}/content.js https://a.com/one https://b.com/two
```

Fetches one or more URLs and prints readable content as markdown.

## Output Format

Plain text as returned by Exa: per-result blocks with `Title`, `URL`, `Published`, and `Highlights`, separated by `---`.

## When to Use

- Searching for documentation or API references
- Looking up facts or current information
- Fetching content from specific URLs
- Queries better described than keyworded, where semantic matching beats term matching
