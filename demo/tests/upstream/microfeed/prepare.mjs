import { checkout } from "../checkout.mjs";
const { run, clean } = await checkout(import.meta.url);
run("corepack", ["yarn", "install", "--immutable"]);
run("corepack", ["yarn", "build"]);
clean();
