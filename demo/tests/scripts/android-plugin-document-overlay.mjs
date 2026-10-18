import { readFile, writeFile, copyFile, unlink } from "node:fs/promises";
const root = new URL("../../", import.meta.url);
const registration = new URL(
  "android/app/src/main/assets/capacitor.plugins.json",
  root,
);
const target = new URL(
  "android/app/src/main/java/jp/rdlabo/workerscapacitor/poc/DocumentConnectionPlugin.java",
  root,
);
const backup = new URL("artifacts/android-plugin-registration.json", root);
if (process.argv[2] === "apply") {
  const original = await readFile(registration, "utf8");
  await writeFile(backup, original, { flag: "wx" });
  await copyFile(
    new URL(
      "../native/connection/DocumentConnectionPlugin.java",
      import.meta.url,
    ),
    target,
  );
  await writeFile(
    registration,
    JSON.stringify([
      ...JSON.parse(original),
      {
        pkg: "connection-probe",
        classpath: "jp.rdlabo.workerscapacitor.poc.DocumentConnectionPlugin",
      },
    ]),
  );
} else if (process.argv[2] === "restore") {
  await writeFile(registration, await readFile(backup));
  await unlink(target);
  await unlink(backup);
} else
  throw Error(
    "Usage: android-plugin-document-overlay.mjs apply|restore (after cap copy android)",
  );
