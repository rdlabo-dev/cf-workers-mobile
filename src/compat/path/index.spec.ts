import path from "node:path";
import {
  defineFeature,
  FeatureImplementation,
} from "@rdlabo/capacitor-workers/features";
import type { ContractSuite } from "@rdlabo/capacitor-workers/testing";

/** node:path module contract, matching the Workers baseline. */
export interface NodePathApi {
  basename(path: string, suffix?: string): string;
  delimiter: string;
  dirname(path: string): string;
  extname(path: string): string;
  format(object: {
    root?: string;
    dir?: string;
    base?: string;
    ext?: string;
    name?: string;
  }): string;
  isAbsolute(path: string): boolean;
  join(...segments: string[]): string;
  matchesGlob(path: string, pattern: string): boolean;
  normalize(path: string): string;
  parse(path: string): {
    root: string;
    dir: string;
    base: string;
    ext: string;
    name: string;
  };
  relative(from: string, to: string): string;
  resolve(...segments: string[]): string;
  sep: string;
  toNamespacedPath(path: string): string;
  posix: NodePathApi;
  win32: NodePathApi;
}

function equal(actual: unknown, expected: unknown, label?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(
      `${label ? `${label}: ` : ""}${JSON.stringify(actual)} != ${JSON.stringify(expected)}`,
    );
}
function throws(
  fn: () => unknown,
  expected: { name?: string; code?: string; message?: RegExp },
) {
  try {
    fn();
  } catch (error) {
    const e = error as { name?: string; code?: string; message?: string };
    if (expected.name && e?.name !== expected.name)
      throw new Error(`Expected error name ${expected.name}, got ${e?.name}`);
    if (expected.code && e?.code !== expected.code)
      throw new Error(`Expected error code ${expected.code}, got ${e?.code}`);
    if (expected.message && !expected.message.test(String(e?.message)))
      throw new Error(
        `Expected message ${expected.message}, got ${e?.message}`,
      );
    return;
  }
  throw new Error(`Expected ${expected.name} to be thrown`);
}

export const nodePathFeature = defineFeature<NodePathApi>()("node.path", [
  "joinNormalize",
  "resolveAbsolute",
  "relativeAbsolute",
  "dirnameBasename",
  "extname",
  "parseFormat",
  "constants",
  "typeErrors",
  "cwdRelative",
  "win32",
  "win32Cwd",
  "win32Namespace",
  "matchesGlob",
  "shape",
]);

export const nodePathContract: ContractSuite<typeof nodePathFeature> = {
  feature: nodePathFeature,
  cases: {
    joinNormalize(api) {
      equal(api.join("a//b", "./c"), "a/b/c");
      equal(api.join(), ".");
      equal(api.normalize("/a//b/./c/.."), "/a/b");
      equal(api.normalize("../a/./b"), "../a/b");
      equal(api.normalize(""), ".");
      equal(api.normalize("a/b/"), "a/b/");
      equal(api.normalize("/"), "/");
      equal(api.normalize("//"), "/");
      equal(api.join("a\\b", "c"), "a\\b/c");
    },
    resolveAbsolute(api) {
      equal(api.resolve("/a", "b", "../c"), "/a/c");
      equal(api.resolve("a", "/b"), "/b");
      equal(api.resolve("/a"), "/a");
      equal(api.resolve("/a", "/b"), "/b");
      equal(api.resolve("/a", "", "c"), "/a/c");
    },
    relativeAbsolute(api) {
      equal(api.relative("/a/b/c", "/a"), "../..");
      equal(api.relative("/a", "/a/b"), "b");
      equal(api.relative("/a", "/b"), "../b");
      equal(api.relative("/", "/x"), "x");
      equal(api.relative("/a", "/a"), "");
      equal(api.relative("/", "/"), "");
    },
    dirnameBasename(api) {
      equal(api.dirname("/a/b/c"), "/a/b");
      equal(api.dirname("a"), ".");
      equal(api.dirname("/"), "/");
      equal(api.dirname("//a"), "//");
      equal(api.basename("/a/b.txt", ".txt"), "b");
      equal(api.basename("/a/bbb", "bb"), "b");
      equal(api.basename("a/"), "a");
      equal(api.basename(""), "");
      equal(api.basename("b.txt", "b.txt"), "");
    },
    extname(api) {
      equal(api.extname("a.b.c"), ".c");
      equal(api.extname(".a"), "");
      equal(api.extname("a."), ".");
      equal(api.extname("a/b"), "");
      equal(api.extname(""), "");
      equal(api.extname(".."), "");
    },
    parseFormat(api) {
      equal(api.parse("/a/b.txt"), {
        root: "/",
        dir: "/a",
        base: "b.txt",
        ext: ".txt",
        name: "b",
      });
      equal(api.parse(""), {
        root: "",
        dir: "",
        base: "",
        ext: "",
        name: "",
      });
      equal(Object.keys(api.parse("/a/b.txt")).sort(), [
        "base",
        "dir",
        "ext",
        "name",
        "root",
      ]);
      equal(api.format({ dir: "/a", name: "b", ext: ".c" }), "/a/b.c");
      equal(api.format({ root: "/", base: "b.txt" }), "/b.txt");
      equal(api.format({ base: "b" }), "b");
      equal(api.format({ name: "a", ext: "txt" }), "a.txt");
      equal(
        api.format(Object.create({ dir: "/a", name: "b", ext: "txt" })),
        "/a/b.txt",
      );
      equal(
        api.format({ base: "b.txt", ext: 123 as unknown as string }),
        "b.txt",
      );
    },
    constants(api) {
      equal(api.sep, "/");
      equal(api.delimiter, ":");
      equal(api.isAbsolute("/x"), true);
      equal(api.isAbsolute("x"), false);
      equal(api.toNamespacedPath("/a"), "/a");
      equal(api.toNamespacedPath(123 as unknown as string), 123);
      equal(api.posix.join("a", "b"), "a/b");
      equal(api.posix === api, true);
    },
    typeErrors(api) {
      throws(() => api.join("a", 1 as unknown as string), {
        name: "TypeError",
        code: "ERR_INVALID_ARG_TYPE",
        message: /The "path" argument must be of type string/,
      });
      throws(() => api.parse({} as unknown as string), {
        name: "TypeError",
        code: "ERR_INVALID_ARG_TYPE",
        message: /an instance of Object/,
      });
      throws(() => api.basename("a", 1 as unknown as string), {
        name: "TypeError",
        code: "ERR_INVALID_ARG_TYPE",
      });
      // Null-prototype inputs reach the same Node error without invoking
      // user-defined toString.
      throws(() => api.join(Object.create(null) as unknown as string), {
        name: "TypeError",
        code: "ERR_INVALID_ARG_TYPE",
      });
      throws(() => api.normalize(Object.create(null) as unknown as string), {
        name: "TypeError",
        code: "ERR_INVALID_ARG_TYPE",
      });
      // Null-prototype inputs are never enumerated: cyclic self references
      // and throwing getters cannot reach error formatting.
      const cyclic = Object.create(null);
      cyclic.self = cyclic;
      throws(() => api.join(cyclic as unknown as string), {
        name: "TypeError",
        code: "ERR_INVALID_ARG_TYPE",
      });
      const getterful = Object.create(null, {
        boom: {
          enumerable: true,
          get() {
            throw new Error("getter invoked");
          },
        },
      });
      throws(() => api.join(getterful as unknown as string), {
        name: "TypeError",
        code: "ERR_INVALID_ARG_TYPE",
      });
      const cyclicPlain = { self: {} as unknown };
      cyclicPlain.self = cyclicPlain;
      throws(() => api.join(cyclicPlain as unknown as string), {
        name: "TypeError",
        code: "ERR_INVALID_ARG_TYPE",
      });
      throws(() => api.format(null as unknown as { dir: string }), {
        name: "TypeError",
        code: "ERR_INVALID_ARG_TYPE",
      });
      throws(() => api.format([] as unknown as { dir: string }), {
        name: "TypeError",
        code: "ERR_INVALID_ARG_TYPE",
      });
    },
    cwdRelative(api) {
      // Workers resolves relative inputs against the virtual cwd '/', which
      // is not the /bundle process.cwd().
      equal(api.resolve("b"), "/b");
      equal(api.resolve(), "/");
      equal(api.resolve("a", "b"), "/a/b");
      equal(api.resolve(".."), "/");
      equal(api.relative("a/b", "a/c"), "../c");
      equal(api.relative("a", "b"), "../b");
    },
    win32(api) {
      const w = api.win32;
      equal(w.sep, "\\");
      equal(w.delimiter, ";");
      equal(w.join("C:\\a", "b"), "C:\\a\\b");
      equal(w.join("//server", "share"), "\\\\server\\share\\");
      equal(w.normalize("C:\\\\a\\\\b"), "C:\\a\\b");
      equal(w.normalize("\\\\server\\share"), "\\\\server\\share\\");
      equal(w.normalize("a\\b\\..\\c"), "a\\c");
      equal(w.isAbsolute("C:\\a"), true);
      equal(w.isAbsolute("C:a"), false);
      equal(w.isAbsolute("\\\\s\\s"), true);
      equal(w.isAbsolute("\\a"), true);
      equal(w.isAbsolute("a"), false);
      equal(w.dirname("C:\\a\\b"), "C:\\a");
      equal(w.dirname("\\\\s\\s"), "\\\\s\\s");
      equal(w.basename("C:\\a\\b.txt", ".txt"), "b");
      equal(w.basename("a\\b"), "b");
      equal(w.extname("C:\\a\\b.txt"), ".txt");
      equal(w.parse("C:\\a\\b.txt"), {
        root: "C:\\",
        dir: "C:\\a",
        base: "b.txt",
        ext: ".txt",
        name: "b",
      });
      equal(w.parse("\\\\s\\s\\d\\f"), {
        root: "\\\\s\\s\\",
        dir: "\\\\s\\s\\d",
        base: "f",
        ext: "",
        name: "f",
      });
      equal(w.format({ dir: "C:\\a", name: "b", ext: ".txt" }), "C:\\a\\b.txt");
      equal(w.format({ root: "C:\\", base: "b" }), "C:\\b");
      equal(w.relative("C:\\a\\b", "C:\\a\\c"), "..\\c");
      equal(w.relative("C:\\a", "D:\\b"), "D:\\b");
      equal(w.relative("C:\\a", "c:\\a"), "");
      equal(w.toNamespacedPath("C:\\a\\b"), "\\\\?\\C:\\a\\b");
      equal(w.toNamespacedPath("\\\\s\\s\\x"), "\\\\?\\UNC\\s\\s\\x");
      equal(w.toNamespacedPath("\\\\?\\C:\\x"), "\\\\?\\C:\\x");
      equal(w.toNamespacedPath(1 as unknown as string), 1);
    },
    win32Cwd(api) {
      const w = api.win32;
      // win32 resolves against the same '/' virtual cwd, producing
      // drive-relative results rather than a drive letter.
      equal(w.resolve("b"), "\\b");
      equal(w.resolve(), "\\");
      equal(w.resolve("C:\\a", "b"), "C:\\a\\b");
      equal(w.resolve("a", "\\\\s\\s\\x"), "\\\\s\\s\\x");
      equal(w.relative("a\\b", "a\\c"), "..\\c");
    },
    win32Namespace(api) {
      const w = api.win32;
      equal(w.win32 === w, true);
      equal(w.posix === api.posix, true);
      equal(api.posix.win32 === w, true);
      equal(w.basename("a/b\\c"), "c");
      equal(w.join("a", "b/c"), "a\\b\\c");
    },
    matchesGlob(api) {
      // workerd exports matchesGlob on both flavors but the operation is
      // unimplemented at this baseline; the rejection is the contract.
      throws(() => api.matchesGlob("/a/b.js", "**/*.js"), {
        name: "Error",
        message: /^path\.posix\.matchesGlob\(\) is not implemented\./,
      });
      throws(() => api.posix.matchesGlob("/a/b.js", "*.js"), {
        name: "Error",
        message: /path\.posix\.matchesGlob\(\) is not implemented\./,
      });
      throws(() => api.win32.matchesGlob("C:\\a.js", "*.js"), {
        name: "Error",
        message: /path\.win32\.matchesGlob\(\) is not implemented\./,
      });
      equal(typeof api.matchesGlob, "function");
    },
    shape(api) {
      equal(api.posix === api, true);
      equal(api.win32 instanceof Object, true);
      for (const name of [
        "basename",
        "dirname",
        "extname",
        "format",
        "isAbsolute",
        "join",
        "matchesGlob",
        "normalize",
        "parse",
        "relative",
        "resolve",
        "toNamespacedPath",
      ]) {
        equal(typeof api[name as keyof NodePathApi], "function", name);
      }
      equal(typeof api.sep, "string", "sep");
      equal(typeof api.delimiter, "string", "delimiter");
      equal(typeof api.posix, "object");
      equal(typeof api.win32, "object");
    },
  },
};

const supported = { status: "supported" } as const;

const coverage = {
  joinNormalize: supported,
  resolveAbsolute: supported,
  relativeAbsolute: supported,
  dirnameBasename: supported,
  extname: supported,
  parseFormat: supported,
  constants: supported,
  typeErrors: supported,
  cwdRelative: supported,
  win32: supported,
  win32Cwd: supported,
  win32Namespace: supported,
  matchesGlob: supported,
  shape: supported,
} as const;

/** The module as resolved by the bundler compatibility aliases. */
export class BundledPath extends FeatureImplementation<typeof nodePathFeature> {
  constructor() {
    super(nodePathFeature, coverage);
  }
  create(): NodePathApi {
    return path;
  }
}

/** The module as provided by real workerd. */
export class WorkersPath extends FeatureImplementation<typeof nodePathFeature> {
  constructor() {
    super(nodePathFeature, coverage);
  }
  create(): NodePathApi {
    return path;
  }
}
