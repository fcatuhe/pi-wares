# loadout

Inside Paseo, declares Paseo's agent, workspace and browser tools to the model, and drops the pi wares they replace.

Paseo starts pi with an extension that registers its MCP server as `paseo` without an `exposure`, so pi gives its tools the default `codemode` exposure: callable from a codemode script, but absent from the tool list the model sees. The model then reaches for the declared `spawn_agent` and the `agent-browser` skill instead. A `paseo` entry in `mcp.json` cannot fix this, since a file entry replaces the registered server whole, and Paseo's URL carries a per-agent `callerAgentId` and token.

At the start of each prompt, once Paseo's tools are registered, it:

- declares `create_agent`, `send_agent_prompt`, `get_agent_status`, `get_agent_activity`, `list_agents`, `list_profiles`, `list_models`, `create_workspace`, `list_workspaces` and the core browser tools: `list_tabs`, `new_tab`, `navigate`, `snapshot`, `click`, `fill`, `type`, `keypress`, `wait`, `screenshot` and `logs`. The other Paseo tools stay reachable from codemode.
- removes from the active tools the `pi-codex-subagents` tools (`spawn_agent`, `wait_agent`, `wait_all_agents`, `list_agents`, `read_agent_response`, `send_message`, `interrupt_agent`) and `herdr_worktree_jump`. They stay registered, so `/tools` can switch them back on.
- drops the `agent-browser` skill from the system prompt, only when Paseo's browser tools are registered.

A tool the host disabled in its `paseoTools` policy is not declared. Before Paseo's server connects, nothing changes.

The first prompt waits up to 10 seconds for Paseo's tools, as pi waits for servers with `direct` tools, since pi emits no event when MCP tools register. It waits only when a `paseo` server is registered, and only once per session.

Inert outside Paseo (`PASEO_AGENT_ID` unset).
