import { test } from "node:test";
import assert from "node:assert/strict";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

// Probe actual behavior before classifying an API as a Workers stub or an
// engine requirement. This does not certify any local compatibility module.
test("the fixed profile exposes engine proxy inspection and async continuation isolation", async () => {
  const runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      compatibilityDate: "2026-10-17",
      script: `import types from 'node:util/types';
import { AsyncLocalStorage } from 'node:async_hooks';
import { DatabaseSync } from 'node:sqlite';
export default { async fetch() {
  let traps = 0;
  const target = { nonCloneable() {} };
  const proxy = new Proxy(target, {get(){traps++;throw new Error('observable trap')}, getPrototypeOf(){traps++;throw new Error('observable trap')}, ownKeys(){traps++;throw new Error('observable trap')}});
  const revoked = Proxy.revocable({},{}); revoked.revoke();
  const inspection = [types.isProxy(target), types.isProxy(proxy), types.isProxy(revoked.proxy)];
  const als = new AsyncLocalStorage();
  const interleaved = await Promise.all(['a','b'].map(value => als.run(value, async () => { await Promise.resolve(); await Promise.resolve(); return als.getStore(); })));
  let sqlite;
  try { new DatabaseSync(':memory:'); sqlite = {created:true}; } catch(e) {sqlite = {name:e.name,message:e.message};}
  return Response.json({inspection,traps,interleaved,restored:als.getStore() === undefined,sqlite});
} };`,
    }),
  );
  try {
    const response = await runtime.dispatchFetch("https://boundaries.invalid/");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      inspection: [false, true, true],
      traps: 0,
      interleaved: ["a", "b"],
      restored: true,
      sqlite: { name: "TypeError", message: "Illegal constructor" },
    });
  } finally {
    await runtime.dispose();
  }
});
