import { checkout } from "../checkout.mjs";
const { run, clean } = await checkout(import.meta.url);
run("npx", ["--yes", "pnpm@9.15.0", "install", "--frozen-lockfile"]);
run("npx", ["--yes", "pnpm@9.15.0", "run", "build"]);
clean();
