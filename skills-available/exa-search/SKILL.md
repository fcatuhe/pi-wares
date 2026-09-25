---
name: exa-search
description: Web search and content extraction via Exa's keyless MCP endpoint, no API key or browser needed. Semantic search that returns page highlights with every result, so a follow-up fetch is often unnecessary. Use for documentation, API references, facts, current information, or fetching given URLs.
---

# Exa search

Works without a key, rate-limited by IP. For unthrottled use, create an API key at https://dashboard.exa.ai (no card, free monthly credits) and export `EXA_API_KEY` in the shell profile. With the key set, requests draw on those credits, and are blocked, never billed, once they run out.

## Search

```bash
{baseDir}/search.js "query"        # 5 results
{baseDir}/search.js "query" -n 10  # up to 20
```

Write the query as a description of the ideal page, not keywords: matching is semantic. There is no date filter, the endpoint takes only `query` and `numResults`, so put recency in the query ("latest", "in 2026").

Output is Exa's plain text: one block per result with `Title`, `URL`, `Published` and `Highlights`, separated by `---`. The highlights often answer the question without a fetch.

## Extract page content

```bash
{baseDir}/content.js https://example.com/article
{baseDir}/content.js https://a.com/one https://b.com/two
```

Prints each page's readable content as markdown.
