export const ACTIVE = "anthropic";
export const SLOT_PREFIX = "anthropic-";

export type Credentials = Record<string, any>;

export interface Account {
  slot: string;
  email: string;
}

export function slotFor(email: string): string {
  const slug = email
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) throw new Error(`Not an account name: "${email}"`);
  return `${SLOT_PREFIX}${slug}`;
}

export function storedAccounts(credentials: Credentials): Account[] {
  return Object.entries(credentials)
    .filter(([slot]) => slot.startsWith(SLOT_PREFIX))
    .map(([slot, credential]) => ({
      slot,
      email: typeof credential?.email === "string" ? credential.email : slot.slice(SLOT_PREFIX.length),
    }))
    .sort((left, right) => left.email.localeCompare(right.email));
}

export function activeCredential(credentials: Credentials): Record<string, any> | undefined {
  return credentials[ACTIVE];
}

export function stash(credentials: Credentials, email: string): Credentials {
  const active = credentials[ACTIVE];
  if (!active) return credentials;
  const { [ACTIVE]: _moved, ...rest } = credentials;
  return { ...rest, [slotFor(email)]: { ...active, email } };
}

export function activate(credentials: Credentials, slot: string): Credentials {
  const stored = credentials[slot];
  if (!stored) throw new Error(`No credential stored under ${slot}`);
  const { [slot]: _moved, ...rest } = credentials;
  return { ...rest, [ACTIVE]: stored };
}
