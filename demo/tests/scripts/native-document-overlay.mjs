import { readFile, writeFile, mkdir, rm, access } from "node:fs/promises";
const root = new URL("../../", import.meta.url);
const backup = new URL("artifacts/native-document-originals/", root);
const files = [
  "android/app/src/main/java/jp/rdlabo/workerscapacitor/poc/MainActivity.java",
  "ios/App/App/SceneDelegate.swift",
];
const action = process.argv[2];
if (!["apply", "restore"].includes(action))
  throw new Error(
    "Usage: node tests/scripts/native-document-overlay.mjs apply|restore",
  );
if (action === "apply") {
  if (
    await access(backup).then(
      () => true,
      () => false,
    )
  )
    throw new Error("Overlay already applied; restore it first");
  const originals = await Promise.all(
    files.map((path) => readFile(new URL(path, root), "utf8")),
  );
  const java = await readFile(
    new URL("../native/documents/MainActivity.java", import.meta.url),
    "utf8",
  );
  const swift = await readFile(
    new URL("../native/documents/DocumentBridge.swift", import.meta.url),
    "utf8",
  );
  await mkdir(backup, { recursive: true });
  for (let i = 0; i < files.length; i++)
    await writeFile(new URL(`${i}.txt`, backup), originals[i]);
  await writeFile(new URL(files[0], root), java);
  await writeFile(
    new URL(files[1], root),
    originals[1].replace(
      "CAPBridgeViewController()",
      "DocumentBridgeController()",
    ) +
      "\n" +
      swift,
  );
} else {
  for (let i = 0; i < files.length; i++)
    await writeFile(
      new URL(files[i], root),
      await readFile(new URL(`${i}.txt`, backup)),
    );
  await rm(backup, { recursive: true });
}
console.log(`Native document overlay: ${action}`);
