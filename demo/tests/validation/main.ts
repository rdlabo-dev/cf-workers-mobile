import { workersCapacitor } from "cf-workers-native/capacitor";
import hono from "../fixtures/workers/hono/standard";
import express from "../fixtures/workers/express/standard";
import { runContract, type Result } from "./contracts/http";
import { Capacitor } from "@capacitor/core";

const output = document.querySelector("pre")!;
const results: Result[] = [];
declare global {
  interface Window {
    pocResults?: Result[];
    pocDone?: boolean;
    runOfflineContract: () => Promise<Result[]>;
  }
}
window.runOfflineContract = async () => {
  const report: Result[] = [];
  for (const [name, worker] of Object.entries({ hono, express })) {
    const runtime = workersCapacitor({
      worker,
      baseURL: "https://worker.invalid/api/",
    });
    try {
      report.push(
        ...(await runContract(fetch)).map((r) => ({
          ...r,
          name: `${name}: ${r.name}`,
        })),
      );
    } finally {
      runtime.dispose();
    }
  }
  return report;
};
async function main() {
  for (const [name, worker] of Object.entries({ hono, express })) {
    const runtime = workersCapacitor({
      worker,
      baseURL: "https://worker.invalid/api/",
    });
    try {
      results.push(
        ...(await runContract(fetch)).map((r) => ({
          ...r,
          name: `${name}: ${r.name}`,
        })),
      );
      const request = new Request("https://worker.invalid/api/echo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: '{"request":true}',
      });
      const response = await fetch(request);
      results.push({
        name: `${name}: Request input`,
        ok: (await response.json()).request === true,
      });
      const url = await (await fetch("/api/url")).json();
      results.push({
        name: `${name}: logical URL`,
        ok: url.url === "https://worker.invalid/api/url",
      });
    } finally {
      await runtime.drain();
      runtime.dispose();
    }
  }
  const errors: unknown[] = [];
  let completed = false;
  const runtime = workersCapacitor({
    baseURL: "https://worker.invalid/api",
    env: { value: "injected" },
    onBackgroundError: (e) => errors.push(e),
    worker: {
      fetch(_request, env, ctx) {
        ctx.waitUntil(
          new Promise<void>((resolve) =>
            setTimeout(() => {
              completed = true;
              resolve();
            }, 20),
          ),
        );
        ctx.waitUntil(Promise.reject(new Error("expected background failure")));
        return Response.json({ value: env.value });
      },
    },
  });
  try {
    const res = await fetch("/api/env");
    results.push({
      name: "env injection",
      ok: (await res.json()).value === "injected",
    });
    results.push({ name: "waitUntil does not delay response", ok: !completed });
    await runtime.drain();
    results.push({
      name: "waitUntil completion + rejection",
      ok: completed && errors.length === 1,
    });
    const asset = await fetch("/outside.txt");
    results.push({
      name: "outside path uses original fetch",
      ok: (await asset.text()).trim() === "original fetch",
    });
  } finally {
    runtime.dispose();
  }
  window.pocResults = results;
  window.pocDone = true;
  const failures = results.filter((r) => !r.ok);
  document.querySelector("h1")!.textContent =
    `${failures.length ? "FAIL" : "PASS"} ${results.length - failures.length}/${results.length}`;
  output.textContent =
    `Platform: ${Capacitor.getPlatform()}\nNo API server · worker.invalid\n\n` +
    results
      .map(
        (r) =>
          `${r.ok ? "✓" : "✗"} ${r.name}${r.error ? `\n  ${r.error}` : ""}`,
      )
      .join("\n");
  console.log(
    "POC_RESULT",
    JSON.stringify({ platform: Capacitor.getPlatform(), results }),
  );
}
main().catch((error) => {
  output.textContent =
    JSON.stringify(results, null, 2) + "\n" + String(error.stack ?? error);
  document.querySelector("h1")!.textContent = "FAIL";
  window.pocDone = true;
});
