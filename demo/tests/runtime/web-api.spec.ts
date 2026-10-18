import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import type { ContractResult } from "@rdlabo/capacitor-workers/testing";

import type { WebApiName } from "../validation/web-api-contracts";

let source: string;
test.beforeAll(async () => {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const result = await build({
    absWorkingDir: root,
    stdin: {
      contents: `
        import { runWebApiContracts } from "./demo/tests/validation/web-api-contracts.ts";
        globalThis.runWebApiContracts = runWebApiContracts;
      `,
      resolveDir: root,
    },
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: "es2022",
    minify: true,
  });
  source = result.outputFiles[0].text;
});

for (const [api, count] of Object.entries({
  encoding: 6,
  abort: 6,
  headers: 8,
  request: 8,
  response: 8,
  immediate: 4,
  structuredClone: 11,
}) as [WebApiName, number][]) {
  for (const execution of ["direct", "worker"] as const) {
    test(`${api} contracts in ${execution}`, async ({ page }) => {
      await page.goto("about:blank");
      const report = await page.evaluate(
        async ({ source, execution, api }) => {
          if (execution === "direct") {
            const script = document.createElement("script");
            script.textContent = source;
            document.head.append(script);
            return (
              globalThis as unknown as {
                runWebApiContracts(name: WebApiName): Promise<ContractResult[]>;
              }
            ).runWebApiContracts(api);
          }
          const url = URL.createObjectURL(
            new Blob(
              [
                source,
                `;runWebApiContracts(${JSON.stringify(api)}).then(report => postMessage(report));`,
              ],
              { type: "text/javascript" },
            ),
          );
          const worker = new Worker(url);
          try {
            return await new Promise<ContractResult[]>((resolve, reject) => {
              worker.onmessage = (event) => resolve(event.data);
              worker.onerror = (event) => reject(new Error(event.message));
            });
          } finally {
            worker.terminate();
            URL.revokeObjectURL(url);
          }
        },
        { source, execution, api },
      );
      expect(report.map((result) => result.cases.length)).toEqual([count]);
      for (const result of report) {
        expect(result.errors).toEqual([]);
        expect(result.cases.filter((test) => test.status !== "passed")).toEqual(
          [],
        );
      }
    });
  }
}
