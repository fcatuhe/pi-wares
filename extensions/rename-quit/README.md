# rename-quit

A pi extension that adds a `/rename-quit` slash command to assign a meaningful name to the current session and exit cleanly.

## Why

After a focused session, a good name makes it findable later in `/resume` and `pi -r`. Doing it as one command means you don't have to think of a name yourself or remember to `/name` before quitting.

## Usage

```text
/rename-quit            # auto-name from conversation, then quit
/rename-quit My Title   # use the supplied name verbatim, then quit
```

## How it works

1. `ctx.waitForIdle()` — ensure no agent turn is in flight.
2. If an explicit name was passed, use it as-is.
3. Otherwise, flatten the current branch's user/assistant text (and tool-call markers) into a transcript and truncate to ~12k chars (head + tail).
4. Call `complete()` from `@earendil-works/pi-ai` against `ctx.model` (the active session model) with a strict "reply with ONE 3–7-word Title Case line" prompt. Auth comes from `ctx.modelRegistry.getApiKeyAndHeaders(model)`.
5. Sanitize the response (strip "Title:", quotes, trailing punctuation, length cap).
6. `pi.setSessionName(name)` then `ctx.shutdown()`.

On any failure (no model, no API key, empty response, network error) the command still quits — without renaming — and notifies why.
