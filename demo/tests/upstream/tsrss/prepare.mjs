import { checkout } from "../checkout.mjs";
const { run, clean } = await checkout(import.meta.url);
// No separate frontend build: upstream serves its checked-in HTML/JS assets.
run("npm", ["ci", "--omit=dev", "--no-audit", "--no-fund"]);
clean();
