export const ACTIVE = "anthropic";
const LEGACY_SLOT_PREFIX = "anthropic-";

export type Credential = Record<string, any>;
export type Credentials = Record<string, Credential>;
export type Bench = Record<string, Credential>;

export interface Switch {
  staged: Bench;
  auth: Credentials;
  bench: Bench;
}

export function benchedEmails(bench: Bench): string[] {
  return Object.keys(bench).sort((left, right) => left.localeCompare(right));
}

// TODO: fc 25sep26 remove once no auth.json still holds anthropic-<email> slots from before the bench file
function legacySlots(auth: Credentials): [string, Credential][] {
  return Object.entries(auth).filter(([slot, credential]) => slot.startsWith(LEGACY_SLOT_PREFIX) && typeof credential?.email === "string");
}

export function withLegacy(auth: Credentials, bench: Bench): Bench {
  return { ...Object.fromEntries(legacySlots(auth).map(([, credential]) => [credential.email, credential])), ...bench };
}

export function switchAccounts(auth: Credentials, bench: Bench, current: string | undefined, target: string | undefined): Switch {
  const active = auth[ACTIVE];
  if (active && !current) throw new Error("the account in use has no name to be stored under");
  const staged = { ...withLegacy(auth, bench), ...(current && active ? { [current]: { ...active, email: current } } : {}) };
  if (target && !staged[target]) throw new Error(`No account stored for ${target}`);

  const legacy = new Set(legacySlots(auth).map(([slot]) => slot));
  const { [ACTIVE]: _leaving, ...others } = Object.fromEntries(Object.entries(auth).filter(([slot]) => !legacy.has(slot)));
  const { [target ?? ""]: arriving, ...rest } = staged;
  return { staged, auth: target ? { ...others, [ACTIVE]: arriving } : others, bench: target ? rest : staged };
}
