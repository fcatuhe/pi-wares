Our Node service started crashing after a deploy. Nothing changed in this file. What's going on and how do I fix it?

```
node:internal/process/promises:394
    triggerUncaughtException(err, true /* fromPromise */);
    ^

TypeError: fetch failed
    at node:internal/deps/undici/undici:13510:13
    at async syncInvoices (/app/src/billing/sync.js:42:20) {
  [cause]: Error: getaddrinfo ENOTFOUND api.stripe.internal
      at GetAddrInfoReqWrap.onlookupall [as oncomplete] (node:dns:120:26) {
    errno: -3008,
    code: 'ENOTFOUND',
    syscall: 'getaddrinfo',
    hostname: 'api.stripe.internal'
  }
}
```

sync.js line 42 is `const res = await fetch(`${process.env.STRIPE_PROXY_URL}/v1/invoices`)`.
