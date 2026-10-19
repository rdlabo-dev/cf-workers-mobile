import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const here = (path) => fileURLToPath(new URL(path, import.meta.url));
if (process.env.NATIVE_TEST_ORIGIN)
  throw Error(
    "Release-skew acceptance uses local workerd; omit NATIVE_TEST_ORIGIN",
  );
const child = spawn(process.execPath, ["--test", here("../native.test.mjs")], {
  stdio: "inherit",
  env: {
    ...process.env,
    OPENNEXT_SPLIT: "1",
    OPENNEXT_LOCAL: "0",
    OPENNEXT_APP_ROOT: here("../../../artifacts/opennext-releases/A"),
    OPENNEXT_BACKEND_ROOT: here("../../../artifacts/opennext-releases/B"),
    OPENNEXT_CLIENT_RELEASE: "A",
    OPENNEXT_BACKEND_RELEASE: "B",
    OPENNEXT_ARTIFACTS: here("../../../artifacts/opennext-releases/native"),
  },
});
child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
