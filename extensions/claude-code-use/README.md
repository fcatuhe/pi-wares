# claude-code-use

Wrapper that loads [`@benvargas/pi-claude-code-use`](https://github.com/ben-vargas/pi-packages/tree/main/packages/pi-claude-code-use)
(Anthropic OAuth payload patching for Claude Code-style subscription use).

## Why a wrapper

The upstream entry point is `node_modules/@benvargas/pi-claude-code-use/extensions/index.ts`.
Listing that path directly in `pi.extensions` makes pi's `/config` selector label it
as a bare `index.ts`: pi prefixes the parent folder name only when that folder isn't
itself called `extensions` (`config-selector.js`, pi 0.82).

Re-exporting the default export from `extensions/claude-code-use/index.ts` gets the
extension picked up by the `extensions` directory scan instead, so it shows up as
`claude-code-use/index.ts`.

Behaviour is unchanged: config is still read from `<cwd>/.pi/extensions/pi-claude-code-use.json`
and `~/.pi/agent/extensions/pi-claude-code-use.json` (path-independent), and the
companion-tool detection for `@benvargas/pi-exa-mcp` / `@benvargas/pi-firecrawl`
keys off those tools' own source info, not this file's location.

Remove this wrapper if upstream ever renames its entry point to
`extensions/pi-claude-code-use.ts`.
