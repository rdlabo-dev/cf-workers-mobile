import { afterAll, beforeAll, expect, it } from "vitest";
import { Miniflare } from "miniflare";

// External certificate acceptance is an explicit suite, separate from offline CI.
// badssl maintains these valid, self-signed and hostname-mismatch endpoints.
const harness = new Miniflare({
  workers: [
    {
      config: {
        name: "tls-acceptance",
        compatibilityDate: "2026-10-17",
        manifest: {
          mainModule: "worker.js",
          modules: {
            "worker.js": {
              type: "esm",
              contents: `
    export default { async fetch(request) {
      const url = new URL(request.url).searchParams.get('target');
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
        await response.body?.cancel();
        return Response.json({ accepted: true, status: response.status });
      } catch (error) { return Response.json({ accepted: false, error: String(error) }); }
    } }`,
            },
          },
        },
      },
    },
  ],
});
beforeAll(async () => {
  await harness.ready;
});
afterAll(async () => {
  await harness.dispose();
});
it.each([
  ["valid", "https://sha256.badssl.com/", true],
  ["self-signed", "https://self-signed.badssl.com/", false],
  ["hostname mismatch", "https://wrong.host.badssl.com/", false],
] as const)(
  "workerd TLS %s",
  async (_name, target, accepted) => {
    const result = (await (
      await harness.dispatchFetch(
        `http://localhost/?target=${encodeURIComponent(target)}`,
      )
    ).json()) as { accepted: boolean; status?: number; error?: string };
    expect(result.accepted, result.error).toBe(accepted);
    if (accepted) expect(result.status).toBe(200);
    else expect(result.error).not.toMatch(/timeout/i);
  },
  20000,
);
