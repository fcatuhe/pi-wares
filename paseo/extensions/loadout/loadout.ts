export function paseoLoadout(active: string[], registered: string[]): string[] {
  if (!registered.includes(PASEO_AGENT_TOOL)) return active;

  const kept = active.filter((name) => !REPLACED_TOOLS.includes(name));
  const added = PASEO_TOOLS.filter((name) => registered.includes(name) && !kept.includes(name));
  return [...kept, ...added];
}

export function paseoSkills<Skill extends { name: string }>(skills: Skill[], registered: string[]): Skill[] {
  if (!registered.includes(PASEO_BROWSER_TOOL)) return skills;

  return skills.filter((skill) => !REPLACED_SKILLS.includes(skill.name));
}

export const PASEO_TOOLS = [
  "create_agent",
  "send_agent_prompt",
  "get_agent_status",
  "get_agent_activity",
  "list_agents",
  "list_profiles",
  "list_models",
  "create_workspace",
  "list_workspaces",
  "browser_list_tabs",
  "browser_new_tab",
  "browser_navigate",
  "browser_snapshot",
  "browser_click",
  "browser_fill",
  "browser_type",
  "browser_keypress",
  "browser_wait",
  "browser_screenshot",
  "browser_logs",
].map((tool) => `mcp__paseo__${tool}`);

export const REPLACED_TOOLS = [
  "spawn_agent",
  "wait_agent",
  "wait_all_agents",
  "list_agents",
  "read_agent_response",
  "send_message",
  "interrupt_agent",
  "herdr_worktree_jump",
  "radio_agents",
  "radio_call",
];

export const REPLACED_SKILLS = ["agent-browser"];

export const PASEO_AGENT_TOOL = "mcp__paseo__create_agent";
const PASEO_BROWSER_TOOL = "mcp__paseo__browser_snapshot";
