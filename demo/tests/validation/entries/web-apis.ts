import { runWebApiContracts } from "../web-api-contracts";
void runWebApiContracts().then((report) => postMessage(report));
