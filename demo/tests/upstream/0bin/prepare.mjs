import { checkout } from "../checkout.mjs";
const { run, clean } = await checkout(import.meta.url);
run("npx", ["--yes", "bun@1.4.3", "install", "--frozen-lockfile"]);
run("npm", ["run", "build"]);
clean();
