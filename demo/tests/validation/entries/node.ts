import { runLocalNodeContracts } from "../node-modules";

void runLocalNodeContracts().then((reports) => postMessage(reports));
