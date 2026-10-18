import { fetchFeature } from "./feature.js";
import type { ContractSuite } from "../../shared/contracts/testing.js";
function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
}
/** Run against fetchContractWorker mounted at https://worker.invalid/api. */
export const fetchContract: ContractSuite<typeof fetchFeature> = {
  feature: fetchFeature,
  cases: {
    async request(fetcher) {
      const response = await fetcher("https://worker.invalid/api/echo?q=1", {
        method: "POST",
        headers: { "x-test": "kept" },
        body: "日本語 🍷",
      });
      equal(await response.json(), {
        method: "POST",
        query: "1",
        header: "kept",
        body: "日本語 🍷",
      });
    },
    async response(fetcher) {
      const response = await fetcher("https://worker.invalid/api/status");
      equal(
        [
          response.status,
          response.headers.get("x-test"),
          await response.text(),
        ],
        [202, "kept", "accepted"],
      );
    },
    async missing(fetcher) {
      const response = await fetcher("https://worker.invalid/api/missing");
      equal([response.status, await response.text()], [404, "missing"]);
    },
    async head(fetcher) {
      const response = await fetcher("https://worker.invalid/api/status", {
        method: "HEAD",
      });
      equal(
        [
          response.status,
          response.headers.get("x-test"),
          await response.text(),
        ],
        [202, "kept", ""],
      );
    },
  },
};
/** Neutral fixture for the portable HTTP contract. */
export const fetchContractWorker = {
  async fetch(request: Request) {
    const url = new URL(request.url);
    if (url.pathname === "/api/echo")
      return Response.json({
        method: request.method,
        query: url.searchParams.get("q"),
        header: request.headers.get("x-test"),
        body: await request.text(),
      });
    if (url.pathname === "/api/status")
      return new Response(request.method === "HEAD" ? null : "accepted", {
        status: 202,
        headers: { "x-test": "kept" },
      });
    return new Response("missing", { status: 404 });
  },
};
