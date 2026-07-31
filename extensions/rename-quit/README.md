# rename-quit

`/rename-quit` names the current session, then exits. A named session is findable later in `/resume` and `pi -r`, and folding both into one command means not having to invent the name yourself or remember `/name` before quitting.

```text
/rename-quit            # name from the conversation, then quit
/rename-quit My Title   # use this name verbatim, then quit
```

Without an explicit name, the branch transcript is flattened, truncated to ~12k chars (head plus tail) and sent to the session's own model for one Title Case line of 3 to 7 words. Any failure (no model, no API key, empty response, network error) still quits, unnamed, and says why.
