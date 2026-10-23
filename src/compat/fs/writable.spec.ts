import { expect, test } from "vitest";
import * as fs from "./index.js";
import { runWithTemporaryFiles } from "./writable.js";

test("temporary files are isolated between requests and from the fallback volume", () => {
  fs.clearVirtualFiles();
  runWithTemporaryFiles(() => {
    fs.mkdirSync("/tmp/request");
    fs.writeFileSync("/tmp/request/data", "one");
    expect(fs.readFileSync("/tmp/request/data", "utf8")).toBe("one");
    runWithTemporaryFiles(() => {
      expect(fs.existsSync("/tmp/request/data")).toBe(false);
      fs.writeFileSync("/tmp/data", "two");
    });
    expect(fs.existsSync("/tmp/data")).toBe(false);
    expect(fs.readFileSync("/tmp/request/data", "utf8")).toBe("one");
  });
  expect(fs.existsSync("/tmp/request/data")).toBe(false);
});

test("concurrent asynchronous requests retain separate temporary files", () => {
  const operation = (value: string) =>
    runWithTemporaryFiles(() => {
      fs.writeFileSync("/tmp/data", value);
      return fs.promises.readFile("/tmp/data", "utf8").then((read: string) => {
        expect(read).toBe(value);
        expect(fs.readFileSync("/tmp/data", "utf8")).toBe(value);
      });
    });
  return Promise.all([operation("first"), operation("second")]);
});

test("a temporary symlink cannot mutate embedded assets", () => {
  fs.registerVirtualFiles({ "/bundle/secret": "original" });
  expect(() => fs.symlinkSync("/bundle/secret", "/tmp/link")).toThrow();
  expect(() => fs.writeFileSync("/bundle/secret", "changed")).toThrow();
  expect(fs.readFileSync("/bundle/secret", "utf8")).toBe("original");
});

test("relative temporary symlinks resolve against their parent directory", async () => {
  await runWithTemporaryFiles(async () => {
    fs.mkdirSync("/tmp/nested");
    fs.writeFileSync("/tmp/nested/data", "local");
    fs.symlinkSync("data", "/tmp/nested/link");
    expect(fs.readFileSync("/tmp/nested/link", "utf8")).toBe("local");
    await fs.promises.symlink("../nested/data", "/tmp/nested/async-link");
    expect(await fs.promises.readFile("/tmp/nested/async-link", "utf8")).toBe(
      "local",
    );
    expect(() =>
      fs.symlinkSync("../../bundle/secret", "/tmp/nested/escape"),
    ).toThrow();
  });
});

test("callback writes report read-only paths asynchronously", async () => {
  let returned = false;
  const done = new Promise<void>((resolve, reject) => {
    fs.writeFile("/bundle/secret", "changed", (error: any) => {
      try {
        expect(returned).toBe(true);
        expect(error.code).toBe("EROFS");
        resolve();
      } catch (failure) {
        reject(failure);
      }
    });
  });
  returned = true;
  await done;
});

test("direct stream constructors use the active request volume", async () => {
  fs.clearVirtualFiles();
  const read = (value: string) =>
    runWithTemporaryFiles(() => {
      fs.writeFileSync("/tmp/stream", value);
      const stream = new fs.ReadStream("/tmp/stream");
      return new Promise<string>((resolve, reject) => {
        let text = "";
        stream.on("data", (chunk: any) => {
          text += chunk.toString();
        });
        stream.on("end", () => resolve(text));
        stream.on("error", reject);
      });
    });
  expect(await Promise.all([read("first"), read("second")])).toEqual([
    "first",
    "second",
  ]);
  expect(fs.existsSync("/tmp/stream")).toBe(false);
});

test("embedded files can be copied into temporary files without exposing mutable storage", async () => {
  fs.registerVirtualFiles({ "/bundle/copy-source": "original" });
  const bytes = fs.readFileSync("/bundle/copy-source") as Uint8Array;
  bytes.fill(0);
  expect(fs.readFileSync("/bundle/copy-source", "utf8")).toBe("original");
  await runWithTemporaryFiles(async () => {
    await fs.promises.copyFile("/bundle/copy-source", "/tmp/copy");
    expect(fs.readFileSync("/tmp/copy", "utf8")).toBe("original");
    fs.writeFileSync("/tmp/copy", "changed");
    expect(fs.readFileSync("/bundle/copy-source", "utf8")).toBe("original");
  });
});

test("permission operations preserve file metadata and statfs is a Workers stub", async () => {
  await runWithTemporaryFiles(async () => {
    fs.writeFileSync("/tmp/data", "content");
    const before = fs.statSync("/tmp/data");
    fs.chmodSync("/tmp/data", 0);
    await fs.promises.chown("/tmp/data", 123, 456);
    const handle = await fs.promises.open("/tmp/data", "r+");
    await handle.chmod(0);
    await handle.chown(123, 456);
    await handle.close();
    const after = fs.statSync("/tmp/data");
    expect([after.mode, after.uid, after.gid]).toEqual([
      before.mode,
      before.uid,
      before.gid,
    ]);
    expect(fs.readFileSync("/tmp/data", "utf8")).toBe("content");
    expect(
      Object.values(await fs.promises.statfs("/missing", { bigint: true })),
    ).toEqual(Array(7).fill(0n));
  });
});
