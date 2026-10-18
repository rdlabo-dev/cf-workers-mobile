import { runNodeContracts } from "../node-modules";

// Executes inside the Dedicated Worker bundle; reports go back verbatim.
void runNodeContracts("bundled").then((reports) => postMessage(reports));
