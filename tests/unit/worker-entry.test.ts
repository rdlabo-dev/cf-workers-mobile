import { expect, it } from "vitest";
import { globalsInstallPath, workerEntry } from "../../src/build/shared.js";

it("installs globals before evaluating a Worker entry without shared bootstrap exports", () => {
  const entry = "/consumer/worker.js";
  const source = workerEntry(entry);
  const installImport = `await import(${JSON.stringify(globalsInstallPath)});`;
  const workerImport = `const { default: worker } = await import(${JSON.stringify(entry)});`;

  expect(source.indexOf(installImport)).toBeGreaterThan(
    source.indexOf("await initializeWorkerNetwork();"),
  );
  expect(source.indexOf(workerImport)).toBeGreaterThan(
    source.indexOf(installImport),
  );
  expect(source).not.toContain("export ");
});
