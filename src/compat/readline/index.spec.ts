import readline, * as namespace from "node:readline";
import promises, * as promisesNamespace from "node:readline/promises";
import { EventEmitter } from "node:events";
import {
  defineFeature,
  FeatureImplementation,
} from "@rdlabo/workers-capacitor/shared/contracts";
import type { ContractSuite } from "@rdlabo/workers-capacitor/shared/contracts/testing";
const groups = [
  "exports",
  "terminal",
  "interface",
  "callbacks",
  "promises",
  "disposal",
  "iteration",
  "readline",
] as const;
export const readlineFeature = defineFeature<typeof readline>()(
  "node.readline",
  groups,
);
function equal(a: unknown, b: unknown) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`);
}
function same(a: unknown, b: unknown) {
  if (a !== b) throw Error("Identity mismatch");
}
export const readlineContract: ContractSuite<typeof readlineFeature> = {
  feature: readlineFeature,
  cases: {
    exports(api) {
      const names = [
        "Interface",
        "clearLine",
        "clearScreenDown",
        "createInterface",
        "cursorTo",
        "emitKeypressEvents",
        "moveCursor",
        "promises",
      ].sort();
      equal(Object.keys(api).sort(), names);
      equal(Object.keys(namespace).sort(), [...names, "default"].sort());
      for (const name of names)
        same((api as any)[name], (namespace as any)[name]);
      const pnames = ["Interface", "Readline", "createInterface"].sort();
      equal(Object.keys(promises).sort(), pnames);
      equal(
        Object.keys(promisesNamespace).sort(),
        [...pnames, "default"].sort(),
      );
      equal(Object.keys(api.promises).sort(), pnames);
      for (const name of pnames)
        same((api.promises as any)[name], (promises as any)[name]);
    },
    terminal(api) {
      for (const name of [
        "clearLine",
        "clearScreenDown",
        "cursorTo",
        "moveCursor",
      ] as const)
        same(Reflect.apply(api[name], undefined, []), false);
      same(Reflect.apply(api.emitKeypressEvents, undefined, []), undefined);
    },
    interface(api) {
      for (const ctor of [api.Interface, promises.Interface]) {
        const value = new (ctor as any)();
        same(value instanceof EventEmitter, true);
        equal([value.terminal, value.line, value.cursor], [false, "", 0]);
        same(value.getPrompt(), "");
        same(value.setPrompt("hello"), undefined);
        same(value.getPrompt(), "");
        same(value.prompt(), undefined);
        same(value.pause(), value);
        same(value.resume(), value);
        same(value.close(), undefined);
        same(value.write("abc"), undefined);
        equal(value.getCursorPos(), { rows: 0, cols: 0 });
        same(value.getCursorPos() === value.getCursorPos(), false);
        let calls = 0;
        value.once("example", () => calls++);
        value.emit("example");
        value.emit("example");
        equal(calls, 1);
      }
      same((api.createInterface as any)() instanceof api.Interface, true);
      same(
        (promises.createInterface as any)() instanceof promises.Interface,
        true,
      );
    },
    callbacks(api) {
      const value = new (api.Interface as any)();
      const answers: string[] = [];
      same(
        value.question("?", (answer: string) => answers.push(answer)),
        undefined,
      );
      same(
        value.question("?", {}, (answer: string) => answers.push(answer)),
        undefined,
      );
      equal(answers, ["", ""]);
      same(value.question(null, 1, 2), undefined);
      const marker = {};
      try {
        value.question("?", () => {
          throw marker;
        });
        throw Error("did not throw");
      } catch (e) {
        same(e, marker);
      }
    },
    async promises() {
      const value = new (promises.Interface as any)();
      same(await value.question("?"), "");
      same(await value.question(null, { signal: AbortSignal.abort() }), "");
    },
    async disposal(api) {
      for (const ctor of [api.Interface, promises.Interface]) {
        const value = new (ctor as any)();
        let calls = 0;
        value.close = () => calls++;
        same(
          value[Symbol.dispose ?? Symbol.for("Symbol.dispose")](),
          undefined,
        );
        same(
          await value[
            Symbol.asyncDispose ?? Symbol.for("Symbol.asyncDispose")
          ](),
          undefined,
        );
        equal(calls, 2);
      }
    },
    async iteration(api) {
      for (const ctor of [api.Interface, promises.Interface]) {
        const value = new (ctor as any)();
        const lines = [];
        for await (const line of value) lines.push(line);
        equal(lines, [""]);
      }
    },
    async readline() {
      const value = new (promises.Readline as any)();
      for (const name of [
        "clearLine",
        "clearScreenDown",
        "cursorTo",
        "moveCursor",
        "rollback",
      ])
        same(value[name](), value);
      same(await value.commit(), undefined);
      equal(
        Object.getOwnPropertyNames(promises.Readline.prototype).sort(),
        [
          "constructor",
          "clearLine",
          "clearScreenDown",
          "commit",
          "cursorTo",
          "moveCursor",
          "rollback",
        ].sort(),
      );
    },
  },
};
export class ReadlineImplementation extends FeatureImplementation<
  typeof readlineFeature
> {
  constructor() {
    super(readlineFeature, {
      exports: { status: "supported" },
      terminal: { status: "supported" },
      interface: { status: "supported" },
      callbacks: { status: "supported" },
      promises: { status: "supported" },
      disposal: { status: "supported" },
      iteration: { status: "supported" },
      readline: { status: "supported" },
    });
  }
  create() {
    return readline;
  }
}
