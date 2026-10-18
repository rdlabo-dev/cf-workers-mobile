import { runContract } from "@rdlabo/capacitor-workers/testing";
import {
  ImmediateImplementation,
  immediateContract,
} from "../../../../../src/compat/immediate/index.spec";
export default {
  async fetch() {
    return Response.json({
      workers: await runContract(
        new ImmediateImplementation({
          setImmediate: globalThis.setImmediate.bind(globalThis),
          clearImmediate: globalThis.clearImmediate.bind(globalThis),
        } as never),
        immediateContract,
      ),
      candidate: await runContract(
        new ImmediateImplementation(),
        immediateContract,
      ),
    });
  },
};
