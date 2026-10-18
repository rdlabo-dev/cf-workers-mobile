import { afterAll, beforeAll, expect, it } from "vitest";
import { createTestHarness } from "wrangler";
import { FeatureImplementation } from "@rdlabo/workers-capacitor/shared/contracts";
import { fetchFeature } from "@rdlabo/workers-capacitor/cloudflare/workers";
import {
  assertContract,
  runContract,
  type ContractResult,
} from "@rdlabo/workers-capacitor/shared/contracts/testing";
import { fetchContract } from "@rdlabo/workers-capacitor/cloudflare/workers/testing";
const http = createTestHarness({
  workers: [
    {
      config: {
        name: "feature-fetch",
        main: "tests/fixtures/workers/compatibility/fetch.ts",
        compatibility_date: "2026-10-01",
      },
    },
  ],
});
const services = createTestHarness({
  workers: [
    {
      config: {
        name: "feature-services",
        main: "tests/fixtures/workers/compatibility/services.ts",
        compatibility_date: "2026-10-01",
        kv_namespaces: [
          { binding: "TEXT", id: "00000000000000000000000000000001" },
        ],
      },
    },
  ],
});
beforeAll(async () => {
  await http.listen();
  await services.listen();
});
afterAll(async () => {
  await http.close();
  await services.close();
});
class WorkersFetch extends FeatureImplementation<typeof fetchFeature> {
  constructor() {
    super(fetchFeature, {
      request: { status: "supported" },
      response: { status: "supported" },
      missing: { status: "supported" },
      head: { status: "supported" },
    });
  }
  create(): typeof fetch {
    return async (input, init) => {
      const request = new Request(input, init);
      const response = await http.fetch(request.url, {
        method: request.method,
        headers: [...request.headers],
        body: request.body ? await request.arrayBuffer() : undefined,
      });
      const body = await response.arrayBuffer();
      return new Response(request.method === "HEAD" ? null : body, {
        status: response.status,
        statusText: response.statusText,
        headers: [...response.headers],
      });
    };
  }
}
it("runs the shared HTTP contract against real workerd", async () => {
  const report = await runContract(new WorkersFetch(), fetchContract);
  assertContract(report);
  expect(report.cases.map((test) => test.status)).toEqual(
    Array(4).fill("passed"),
  );
});
it("runs the same state and engine contracts against actual workerd KV and WebAssembly", async () => {
  const reports = (await (
    await services.fetch("/contracts")
  ).json()) as ContractResult[];
  expect(reports).toHaveLength(2);
  for (const report of reports) assertContract(report);
  expect(reports.map((report) => report.cases.length)).toEqual([18, 2]);
  expect(
    reports
      .flatMap((report) => report.cases)
      .every((test) => test.status === "passed"),
  ).toBe(true);
});

it("runs the unchanged KV handler against a real Workers binding", async () => {
  const path = `/kv?key=${crypto.randomUUID()}`;
  try {
    expect(
      (await services.fetch(path, { method: "PUT", body: "saved 🍷" })).status,
    ).toBe(204);
    const response = await services.fetch(path);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("saved 🍷");
  } finally {
    expect((await services.fetch(path, { method: "DELETE" })).status).toBe(204);
  }
  expect((await services.fetch(path)).status).toBe(404);
});

it("expires actual workerd KV values, metadata and list entries after the minimum TTL", async () => {
  expect((await services.fetch("/expiration", { method: "PUT" })).status).toBe(
    204,
  );
  await new Promise((resolve) => setTimeout(resolve, 61_000));
  const result = (await (await services.fetch("/expiration")).json()) as {
    value: unknown;
    metadata: { value: unknown; metadata: unknown };
    listing: { keys: unknown[] };
  };
  expect(result.value).toBeNull();
  expect(result.metadata.value).toBeNull();
  expect(result.metadata.metadata).toBeNull();
  expect(result.listing.keys).toEqual([]);
}, 75_000);
