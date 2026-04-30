# pi-wares

A small personal stash of extensions for [pi-coding-agent](https://github.com/badlogic/pi-mono) — slopware, forkware, freeware, all of the above.

Shipped as a single pi package. Install once, toggle individual wares on/off in `pi config`.

## Install

As a local-path package during development:

```jsonc
// ~/.pi/agent/settings.json
{
  "packages": [
    "~/fcode/pi-wares"
  ]
}
```

Or directly from git once published:

```jsonc
{
  "packages": [
    "git:github.com/<you>/pi-wares"
  ]
}
```

Then `pi config` to enable/disable individual wares.

## Wares

| Ware | What it does |
|---|---|
| [`model-shortcuts/`](./model-shortcuts/README.md) | Slash-command shortcuts for switching model + thinking level (`/opus`, `/glm:high`, ...) |

More to come.

## Layout

```
pi-wares/
├── package.json              ← name: "pi-wares", lists every ware in `pi.extensions`
├── tsconfig.json
├── model-shortcuts/
│   ├── model-shortcuts.ts    ← entry point
│   ├── pi-model-shortcuts.example.json
│   └── README.md
└── ...                       ← future wares: bare-named subfolders, no `pi-` prefix
```

Each ware is a subfolder with its own README and `<name>.ts` entry. The outer `package.json`'s `pi.extensions` array is the single source of truth for what loads. Inner folders are not separately publishable npm packages — they're just organization.

## License

MIT
