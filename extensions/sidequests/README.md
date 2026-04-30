# sidequests

> **Status:** spec only. Not yet implemented. See [SPEC.md](./SPEC.md).

Spawn N parallel pi sessions from one. Each is a real, persistent, resumable pi session — pick any of them up later with `pi --session <name>`.

```ts
sidequest({
  tasks: [
    { prompt: "investigate auth flow",    name: "auth"      },
    { prompt: "investigate ratelimit",    name: "ratelimit" },
    { prompt: "investigate caching",      name: "caching"   },
  ],
  concurrency: 4
})
```

This README will be expanded once the ware is implemented. For now, see [`SPEC.md`](./SPEC.md) for the full design and implementation guide.
