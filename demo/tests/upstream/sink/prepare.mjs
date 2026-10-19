import { checkout } from "../checkout.mjs";
const { run, clean } = await checkout(import.meta.url);
run("npx", ["--yes", "pnpm@11.11.0", "install", "--frozen-lockfile"]);
run("npx", ["--yes", "pnpm@11.11.0", "run", "build"]);
clean();
