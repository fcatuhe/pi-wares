Write the README.md for this small module. Reply with the README content only.

```js
// lib/retry.js
export async function retry(fn, { attempts = 3, baseMs = 200, retryOn = () => true } = {}) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn(i);
    } catch (error) {
      lastError = error;
      if (!retryOn(error) || i === attempts - 1) break;
      const delay = baseMs * 2 ** i * (0.5 + Math.random() / 2);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}
```
