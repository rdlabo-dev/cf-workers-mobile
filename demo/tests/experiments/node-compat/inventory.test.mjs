import { createRequire } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

// Export discovery is an audit, not a compatibility certificate. Inspect
// descriptors without invoking getters or arbitrary exported functions.
const profile = { compatibilityDate: "2026-10-17", workerd: "1.20261012.1" };
const artifacts = new URL(
  "../../../artifacts/node-inventory/",
  import.meta.url,
);
test("capture every builtin export from the pinned Workers profile", async () => {
  const require = createRequire(import.meta.url);
  const workerdPackage = JSON.parse(
    await readFile(require.resolve("workerd/package.json"), "utf8"),
  );
  assert.equal(workerdPackage.version, profile.workerd);
  const runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      compatibilityDate: profile.compatibilityDate,
      script: `import { builtinModules } from 'node:module';
const describe = (value) => {
  const result = { type: typeof value };
  if (value === null || !['object','function'].includes(typeof value)) {
    result.value = typeof value === 'symbol' ? String(value) : value;
    return result;
  }
  result.properties = Object.getOwnPropertyNames(value).sort();
  if (typeof value === 'function') {
    result.name = value.name; result.length = value.length;
    if (value.prototype) result.prototype = Object.getOwnPropertyNames(value.prototype).sort();
  }
  return result;
};
export default { async fetch() {
  const names = [...new Set([...builtinModules, 'test', 'sqlite'])].sort();
  const modules = {};
  for (const name of names) {
    try {
      const api = await import('node:' + name);
      modules[name] = { exports: Object.fromEntries(Object.entries(api).map(([k,v]) => [k, describe(v)])) };
    } catch (error) {
      modules[name] = { error: { name: error.name, message: error.message, code: error.code } };
    }
  }
  return Response.json({ builtinModules, modules });
} };`,
    }),
  );
  try {
    const response = await runtime.dispatchFetch("https://inventory.invalid/");
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.ok(result.builtinModules.length > 50);
    assert.ok(result.modules.url.exports.URL);
    assert.ok(result.modules.fs.exports);
    const expected = JSON.parse(
      await readFile(new URL("exports.json", import.meta.url), "utf8"),
    );
    assert.deepEqual(expected.profile, profile);
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(result.modules).map(([name, result]) => [
          name,
          Object.keys(result.exports ?? {}).sort(),
        ]),
      ),
      expected.modules,
    );
    await mkdir(artifacts, { recursive: true });
    await writeFile(
      new URL("workerd.json", artifacts),
      JSON.stringify({ profile, ...result }, null, 2) + "\n",
    );
    console.log(
      Object.entries(result.modules)
        .map(
          ([name, value]) =>
            `${name}: ${value.error ? value.error.message : Object.keys(value.exports).length + " exports"}`,
        )
        .join("\n"),
    );
  } finally {
    await runtime.dispose();
  }
});
