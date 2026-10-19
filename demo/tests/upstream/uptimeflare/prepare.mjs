import { checkout } from "../checkout.mjs";
const { run, clean } = await checkout(import.meta.url);
run("npm", ["ci", "--no-audit", "--no-fund"]);
run("npx", ["--no-install", "@cloudflare/next-on-pages"]);
clean();
