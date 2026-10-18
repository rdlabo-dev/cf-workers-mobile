import { runWebApis } from "../../../validation/web-apis";
import { Capacitor } from "@capacitor/core";
import { runFrameworkContract } from "./frameworks";

type Result = { name: string; ok: boolean; error?: string; excluded?: boolean };
const results: Result[] = [];
function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
}
async function until(check: () => Promise<boolean>) {
  const deadline = Date.now() + 3000;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error("Observation timed out");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

export async function runNativeExperiment() {
  const upstream = `${location.protocol}//${location.host}`;
  const tests: [string, () => Promise<void>][] = [
    [
      "statusText + body completion",
      async () => {
        const response = await fetch("/api/status");
        equal(response.status, 202);
        equal(response.statusText, "Queued");
        equal(await response.text(), "ok");
        await window.experiment.drain();
      },
    ],
    [
      "outbound fetch + concurrent request + waitUntil",
      async () => {
        const outgoing = Promise.all(
          ["a", "b", "c"].map(async (id) =>
            (await fetch(`/api/outbound?id=${id}`)).json(),
          ),
        );
        const [values, echo] = await Promise.all([
          outgoing,
          fetch("/api/echo", { method: "POST", body: "日本語 🍷" }).then(
            (response) => response.text(),
          ),
        ]);
        equal(echo, "日本語 🍷");
        equal(
          values,
          ["a", "b", "c"].map((id) => ({
            upstream: "native upstream",
            url: `https://worker.invalid/api/outbound?id=${id}`,
            dom: false,
          })),
        );
        await window.experiment.drain();
        equal(window.experiment.errors, []);
      },
    ],
    [
      "stream chunks + source cancellation",
      async () => {
        const reader = (await fetch("/api/stream")).body!.getReader();
        equal(new TextDecoder().decode((await reader.read()).value), "first");
        await reader.cancel();
        await until(
          async () =>
            (await (await fetch("/api/stats")).json()).cancelled === 1,
        );
      },
    ],
    [
      "abort reaches the pending handler",
      async () => {
        const controller = new AbortController();
        const pending = fetch("/api/abort", { signal: controller.signal }).then(
          () => "unexpected",
          (error) => error.name,
        );
        await until(
          async () => (await (await fetch("/api/stats")).json()).active === 1,
        );
        controller.abort();
        equal(await pending, "AbortError");
        await until(
          async () => (await (await fetch("/api/stats")).json()).aborted === 1,
        );
      },
    ],
    [
      "abort after headers errors the body",
      async () => {
        const controller = new AbortController();
        const reader = (
          await fetch("/api/stream", { signal: controller.signal })
        ).body!.getReader();
        await reader.read();
        const pending = reader.read().then(
          () => "unexpected",
          (error) => error,
        );
        controller.abort(null);
        equal(await pending, null);
        await until(
          async () =>
            (await (await fetch("/api/stats")).json()).cancelled === 1,
        );
        await window.experiment.drain();
      },
    ],
    [
      "handler error + local 404",
      async () => {
        equal(
          await fetch("/api/failure").then(
            () => "unexpected",
            (error) => error.name,
          ),
          "TypeError",
        );
        equal((await fetch("/api/missing")).status, 404);
      },
    ],
  ];
  for (const [name, run] of tests) {
    let runtime: ReturnType<typeof window.startExperiment> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      runtime = window.startExperiment(upstream, "https://worker.invalid/api");
      window.experiment = runtime;
      await Promise.race([
        run(),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Experiment timed out")),
            8000,
          );
        }),
      ]);
      results.push({ name, ok: true });
    } catch (error) {
      results.push({ name, ok: false, error: String(error) });
    } finally {
      clearTimeout(timer);
      await runtime?.dispose();
    }
  }
  for (const framework of ["hono", "express"] as const) {
    let runtime: ReturnType<typeof window.startExperiment> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const current = window.startExperiment(
        upstream,
        "https://worker.invalid/api",
        framework,
      );
      runtime = current;
      window.experiment = current;
      const checks = await Promise.race([
        (async () => {
          const checks = await runFrameworkContract(framework);
          await current.drain();
          equal(current.errors, []);
          return checks;
        })(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Framework experiment timed out")),
            15000,
          );
        }),
      ]);
      results.push(...checks);
    } catch (error) {
      results.push({
        name: `${framework}: runtime completion`,
        ok: false,
        error: String(error),
      });
    } finally {
      clearTimeout(timer);
      await runtime?.dispose();
    }
  }
  let featureTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    const reports = await Promise.race([
      Promise.all([window.runFeatures(), runWebApis()]).then((reports) =>
        reports.flat(),
      ),
      new Promise<never>((_, reject) => {
        featureTimer = setTimeout(
          () => reject(new Error("Feature verification timed out")),
          15000,
        );
      }),
    ]);
    for (const report of reports) {
      console.log("FEATURE_REPORT", JSON.stringify(report));
      for (const test of report.cases)
        results.push({
          name: `${report.environment}: ${report.feature}/${test.id}`,
          ok: test.status === "passed",
          excluded: test.status === "unsupported",
          error: test.reason,
        });
    }
  } catch (error) {
    results.push({
      name: "common feature verification",
      ok: false,
      error: String(error),
    });
  } finally {
    clearTimeout(featureTimer);
  }
  for (const mode of ["worker", "direct", "binding"] as const) {
    const runtime = window.startPreferred(
      mode === "direct" ? "direct" : undefined,
      mode === "binding"
        ? {
            KV: {
              get() {
                return "value";
              },
            },
          }
        : {},
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        runtime.ready,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Preference initialization timed out")),
            8000,
          );
        }),
      ]);
      equal(runtime.execution, mode === "worker" ? "worker" : "direct");
      equal(
        await (
          await fetch("/api/echo", { method: "POST", body: "preference 🍷" })
        ).text(),
        "preference 🍷",
      );
      const globals = await (await fetch("/api/node-globals")).json();
      equal(globals.unqualified, [true, true]);
      equal(globals.qualified, [true, true, true]);
      equal(globals.computed, [true, true, true]);
      equal(globals.dynamic, [true, true, true, true, true]);
      equal(globals.processEnv, {});
      results.push({ name: `node globals: ${mode}`, ok: true });
      results.push({ name: `preference: ${mode}`, ok: true });
    } catch (error) {
      results.push({
        name: `preference: ${mode}`,
        ok: false,
        error: String(error),
      });
    } finally {
      clearTimeout(timer);
      await runtime.dispose();
    }
  }
  const report = {
    platform: Capacitor.getPlatform(),
    url: location.href,
    userAgent: navigator.userAgent,
    transport: "message-port-chunks",
    results,
  };
  document.body.innerHTML = "<h1></h1><pre></pre>";
  document.querySelector("h1")!.textContent =
    `${results.every((r) => r.ok) ? "PASS" : "FAIL"} ${results.filter((r) => r.ok && !r.excluded).length} passed, ${results.filter((r) => r.excluded).length} excluded`;
  document.querySelector("pre")!.textContent = JSON.stringify(report, null, 2);
  console.log("NATIVE_EXPERIMENT", JSON.stringify(report));
  console.log(
    "NATIVE_SUMMARY",
    JSON.stringify({
      passed: results.filter((r) => r.ok && !r.excluded).length,
      excluded: results.filter((r) => r.excluded).length,
      failures: results.filter((r) => !r.ok),
    }),
  );
}
