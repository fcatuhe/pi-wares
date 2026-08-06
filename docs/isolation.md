# isolation

Risky pi sessions run in a [Gondolin](https://github.com/earendil-works/gondolin) micro-VM.

pi ships no sandbox, and its `docs/security.md` is explicit that this is deliberate: a partial in-process sandbox reads as a boundary while still depending on the host shell, filesystem, package managers, and extension code. Real isolation comes from the OS. So this is containment, not prevention. Prompt injection from a repo file, a comment, or build output stays possible; the point is that an injected command has nothing worth reaching.

## What we gain

| Gain | How |
|---|---|
| The agent sees one directory | `$PWD` at launch is mounted at `/workspace`. `~/.ssh`, sibling repos, and dotfiles do not exist in the guest. |
| Egress is an allowlist | The network stack is host-side TypeScript. Unnamed hosts are refused, and `blockInternalRanges` covers your LAN and metadata endpoints. |
| API keys never enter the guest | The guest holds a placeholder. The host swaps in the real value only for that key's hosts. |
| SSH keys never enter the guest | `ssh.allowedHosts` plus `ssh.agent` terminates SSH on the host and proxies git upstream. |
| Provider keys are not in scope | pi runs on the host and only routes tool execution in, so `auth.json` never crosses. |
| The blast radius is throwaway | Writes outside `/workspace` die with the VM. |

## How it works

QEMU with `-accel hvf`, so Apple's Hypervisor.framework: a real kernel boundary, hardware accelerated. Gondolin wants that low-level API because it implements the network stack and the virtual filesystem itself, in TypeScript, on the host. That is where the allowlist and the secret substitution live, and why they are code rather than firewall config.

pi stays on the host. An extension replaces the built-in tools with versions that execute in the guest.

| In the VM | On the host |
|---|---|
| `read`, `write`, `edit`, `bash`, `grep`, `find`, `ls`, and `!` commands | pi itself, sessions, settings, `auth.json` |
| `$PWD` at launch, mounted writable, write-through | every other path |
| | every extension tool that is not one of those overrides |

Absolute host paths outside the mount resolve against the guest root, so `read ~/.ssh/id_ed25519` finds nothing.

## How we do it

1. `brew install qemu`. Node >= 23.6 is already the floor.
2. Fork pi's `examples/extensions/gondolin` into `extensions/gondolin/`. As shipped it mounts the cwd and configures no network policy and no secrets, and with `allowedHosts` omitted egress is unrestricted, so it delivers filesystem isolation and nothing else.
3. Wire the hooks below into `VM.create()`, and merge their `env` into every exec.
4. Mount the skills directory read-only, so the skills that call scripts keep working.
5. Gate on a marker file in the repo root, the same `when/` pattern as [`policies/`](../extensions/policies/).
6. Add a `/wares-doctor` target for the QEMU dependency.

### Secrets

```ts
const { httpHooks, env } = createHttpHooks({
  allowedHosts: ["api.search.brave.com", "github.com", "registry.npmjs.org"],
  secrets: {
    BRAVE_API_KEY: { hosts: ["api.search.brave.com"], value: process.env.BRAVE_API_KEY! },
  },
});
```

`echo $BRAVE_API_KEY` in the guest prints the placeholder, Brave calls work, and the same variable sent anywhere else is worthless. Substitution covers headers, and query params behind `replaceSecretsInQuery`. Sending a *real* secret value to a host outside its list is refused, so this doubles as a leak detector. `secretManager` rotates without a restart. Same shape for `gog`, `ol`, and any GitHub token.

### Gating

Not global. The example boots the VM from `before_agent_start`, so loading it globally costs a micro-VM on the first prompt of every session, including the ones that never touch a file.

Reserve it for what warrants it: untrusted repos, unattended runs, anything you would not watch. Your own repo with you at the keyboard does not need it, and paying VM boot plus a cold `node_modules` every session is how a safety mechanism gets uninstalled in a week.

## Where to run it

`process.cwd()` at activation is the mount and the boundary.

- Launch at the repo root. From a subdirectory, `.git` sits above the mount and git fails.
- Never from `$HOME`. That mounts everything, writable, which is isolation in name only.
- Never from a directory of sibling repos.

One VM per session, so four herdr tabs are four VMs.

## What it costs

- **TLS interception.** The host holds a CA the guest trusts and sees the plaintext of every guest request. Certificate pinning inside the guest breaks.
- **Skills that call host CLIs.** `bash` runs in the guest, so `gog`, `ol`, and `agent-browser` are not there. Install them in the guest image or keep those sessions unisolated. A read-only skills mount covers the script-based ones like `brave-search`.
- **No global caches or identity.** No `~/.npm`, `~/.cargo`, `~/.gitconfig`, `~/.ssh`. Cold dependency installs on every VM.
