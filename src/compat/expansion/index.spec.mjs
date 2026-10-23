export const eventCases = {
  tlsCustomDuplexStates: async function ({ tls: t, classicStreams: s }) {
    const out = {};
    const tick = () => new Promise((r) => setTimeout(r, 15));
    for (const mode of [
      "eof",
      "writeError",
      "parentObserved",
      "directError",
      "destroy",
      "object",
      "encoding",
    ]) {
      const events = [];
      const custom = new s.Duplex({
        allowHalfOpen: true,
        objectMode: mode === "object",
        read() {},
        write(c, e, cb) {
          cb(
            ["writeError", "parentObserved"].includes(mode)
              ? new Error("write fail")
              : undefined,
          );
        },
      });
      custom.on("error", (e) => events.push("customError:" + e.message));
      custom.on("close", () => events.push("customClose"));
      if (mode === "encoding") custom.setEncoding("utf8");
      let wrapped;
      try {
        wrapped = new t.TLSSocket(custom);
        custom.on("error", (e) => events.push("lateCustomError:" + e.message));
        if (mode === "parentObserved")
          wrapped._parentWrap.on("error", (e) =>
            events.push("parentError:" + e.message),
          );
        wrapped.on("error", (e) => events.push("error:" + e.message));
        wrapped.on("close", () => events.push("close"));
        wrapped.on("end", () => events.push("end"));
        wrapped.on("data", (c) => events.push("data:" + String(c)));
        await tick();
        if (mode === "eof") custom.push(null);
        if (["writeError", "parentObserved"].includes(mode))
          wrapped.write("x", (e) => events.push("write:" + e?.message));
        if (mode === "directError") custom.emit("error", new Error("manual"));
        if (mode === "destroy") wrapped.destroy();
        if (mode === "object") custom.push({ x: 1 });
        if (mode === "encoding") custom.push("abc");
        await tick();
        out[mode] = {
          events: [...events],
          destroyed: wrapped.destroyed,
          customDestroyed: custom.destroyed,
        };
      } catch (e) {
        out[mode] = { name: e.name, message: e.message, events: [...events] };
      } finally {
        wrapped?.destroy();
        custom.destroy();
        await tick();
      }
    }
    return out;
  },
  tlsCustomDuplex: async function ({ tls, classicStreams }) {
    const writes = [];
    const custom = new classicStreams.Duplex({
      read() {},
      write(chunk, encoding, callback) {
        writes.push(Array.from(chunk));
        callback();
      },
    });
    const wrapped = new tls.TLSSocket(custom);
    wrapped.on("error", () => {});
    const read = new Promise((resolve) =>
      wrapped.once("data", (chunk) => resolve(Array.from(chunk))),
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    await new Promise((resolve, reject) =>
      wrapped.write(new Uint8Array([1, 2]), (error) =>
        error ? reject(error) : resolve(),
      ),
    );
    custom.push(new Uint8Array([3, 4]));
    const data = await read;
    const result = {
      writes,
      data,
      encrypted: wrapped.encrypted,
      authorized: wrapped.authorized,
      secureConnecting: wrapped.secureConnecting,
    };
    wrapped.destroy();
    custom.destroy();
    return result;
  },
  cryptoWebExtensions: async function ({ crypto }) {
    const attempt = async (fn) => {
      try {
        return await fn();
      } catch (e) {
        return { name: e.name, message: e.message, code: e.code ?? null };
      }
    };
    const result = {};
    for (const algorithm of [
      "SHA-1",
      "SHA-256",
      "SHA-384",
      "SHA-512",
      "MD5",
      "crc32",
      "crc32c",
      "crc64nvme",
      "sha-256",
      "SHA-256\0suffix",
      "sha256",
      "MD4",
      null,
      {},
      42,
    ])
      result[String(algorithm)] = await attempt(async () => {
        const d = new crypto.webcrypto.DigestStream(algorithm),
          w = d.getWriter();
        await w.write("1234");
        await w.write(new Uint8Array([53, 54, 55, 56, 57]));
        await w.close();
        return {
          digest: Array.from(new Uint8Array(await d.digest)),
          count: String(d.bytesWritten),
        };
      });
    for (const well of [false, true])
      for (const chunks of [
        ["\ud800"],
        ["\ud800", "\udc00"],
        ["\ud800", new Uint8Array([65]), "\udc00"],
      ])
        result[well + ":" + JSON.stringify(chunks)] = await attempt(
          async () => {
            const d = new crypto.webcrypto.DigestStream("SHA-256", {
                toWellFormed: well,
              }),
              w = d.getWriter(),
              counts = [];
            for (const chunk of chunks) {
              await w.write(chunk);
              counts.push(String(d.bytesWritten));
            }
            await w.close();
            return {
              counts,
              final: String(d.bytesWritten),
              digest: Array.from(new Uint8Array(await d.digest)),
            };
          },
        );
    const d = new crypto.webcrypto.DigestStream("SHA-256");
    const reason = { abort: true },
      rejected = d.digest.catch((e) => e);
    await d.abort(reason);
    result.abort = (await rejected) === reason;
    const disposed = new crypto.webcrypto.DigestStream("SHA-256"),
      writer = disposed.getWriter();
    const disposal = disposed.digest.catch((e) => ({
      name: e.name,
      message: e.message,
    }));
    disposed[Symbol.dispose]();
    disposed[Symbol.dispose]();
    await writer.write("");
    result.disposed = await disposal;
    result.afterDispose = await attempt(() => writer.write("a"));
    for (const [i, value] of [
      null,
      {},
      "a",
      new ArrayBuffer(1),
      new Uint8Array(1),
      new DataView(new ArrayBuffer(1)),
    ].entries())
      result["timing" + i] = await attempt(() =>
        crypto.subtle.timingSafeEqual(value, new Uint8Array(1)),
      );
    result.timingLength = await attempt(() =>
      crypto.subtle.timingSafeEqual(new Uint8Array(1), new Uint8Array(2)),
    );
    result.timingDifferent = crypto.subtle.timingSafeEqual(
      new Uint8Array([1]),
      new Uint8Array([2]),
    );
    const named = function () {};
    Object.defineProperty(named, "name", { value: "SHA-256" });
    result.functionAlgorithm = await attempt(async () => {
      const d = new crypto.webcrypto.DigestStream(named);
      await d.getWriter().close();
      return Array.from(new Uint8Array(await d.digest));
    });
    for (const view of [
      new Uint8Array([1]),
      new DataView(new Uint8Array([1]).buffer),
    ]) {
      Object.defineProperties(view, {
        buffer: { value: new Uint8Array([9]).buffer },
        byteOffset: { value: 0 },
        byteLength: { value: 1 },
      });
      result["shadowCompare:" + view.constructor.name] =
        crypto.subtle.timingSafeEqual(view, new Uint8Array([1]));
      const d = new crypto.webcrypto.DigestStream("crc32"),
        w = d.getWriter();
      await w.write(view);
      await w.close();
      result["shadowDigest:" + view.constructor.name] = Array.from(
        new Uint8Array(await d.digest),
      );
    }
    const detached = new ArrayBuffer(1),
      detachedView = new DataView(detached);
    structuredClone(detached, { transfer: [detached] });
    result.detached = [
      crypto.subtle.timingSafeEqual(detached, new ArrayBuffer(0)),
      crypto.subtle.timingSafeEqual(detachedView, new ArrayBuffer(0)),
    ];
    return result;
  },
  cryptoSignatureParameters: function ({ crypto }) {
    const attempt = (fn) => {
      try {
        return fn();
      } catch (e) {
        return { name: e.name, message: e.message, code: e.code ?? null };
      }
    };
    const data = new Uint8Array([1, 2]);
    const rsa = crypto.generateKeyPairSync("rsa", { modulusLength: 1024 });
    const privatePem = rsa.privateKey.export({ format: "pem", type: "pkcs8" });
    const publicPem = rsa.publicKey.export({ format: "pem", type: "spki" });
    const signature = crypto.sign("sha256", data, rsa.privateKey);
    const results = [];
    for (const padding of [-1, 0, 1, 2, 3, 4, 5, 6, 99])
      for (const saltLength of [undefined, -3, -2, -1, 0, 32, 95]) {
        const options = { padding, saltLength };
        results.push([
          attempt(
            () =>
              crypto
                .createSign("sha256")
                .update(data)
                .sign({ key: privatePem, ...options }).length,
          ),
          attempt(() =>
            crypto
              .createVerify("sha256")
              .update(data)
              .verify({ key: publicPem, ...options }, signature),
          ),
          attempt(
            () =>
              crypto.sign("sha256", data, { key: privatePem, ...options })
                .length,
          ),
          attempt(() =>
            crypto.verify(
              "sha256",
              data,
              { key: publicPem, ...options },
              signature,
            ),
          ),
        ]);
      }
    const ec = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const ecPrivate = ec.privateKey.export({ format: "pem", type: "pkcs8" }),
      ecPublic = ec.publicKey.export({ format: "pem", type: "spki" });
    for (const padding of [undefined, -1, 3, 99])
      results.push([
        attempt(
          () =>
            crypto
              .createSign("sha256")
              .update(data)
              .sign({ key: ecPrivate, padding }).length > 0,
        ),
        attempt(() =>
          crypto
            .createVerify("sha256")
            .update(data)
            .verify({ key: ecPublic, padding }, new Uint8Array([1])),
        ),
      ]);
    for (const signature of [
      null,
      {},
      [],
      new ArrayBuffer(1),
      new DataView(new ArrayBuffer(1)),
    ])
      results.push(
        attempt(() =>
          crypto
            .createVerify("sha256")
            .update(data)
            .verify(ec.publicKey, signature),
        ),
      );
    for (const type of ["ed25519", "x25519"]) {
      const pair = crypto.generateKeyPairSync(type);
      const signer = crypto.createSign("sha256").update(data);
      results.push(
        attempt(() => signer.sign(pair.privateKey)),
        attempt(() => {
          signer.update(data);
          return true;
        }),
      );
      results.push(
        attempt(() => crypto.sign("sha256", data, pair.privateKey)),
        attempt(() =>
          crypto.verify("sha256", data, pair.publicKey, new Uint8Array(64)),
        ),
      );
    }
    return results;
  },
  cryptoSignatureInventory: function ({ crypto }) {
    const attempt = (fn) => {
      try {
        return fn();
      } catch (e) {
        return { name: e.name, message: e.message, code: e.code ?? null };
      }
    };
    const result = {};
    result.constants = {
      nullPrototype: Object.getPrototypeOf(crypto.constants) === null,
      descriptors: Object.getOwnPropertyDescriptors(crypto.constants),
    };
    for (const algorithm of [
      "sha3-256",
      "ripemd160",
      "blake2b512",
      "DSA-SHA",
      "sha256",
      "SHA256",
      "sha256\0suffix",
    ]) {
      for (const operation of ["createSign", "createVerify"])
        result[operation + ":" + algorithm] = attempt(() => {
          crypto[operation](algorithm);
          return true;
        });
    }
    const pair = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const data = new Uint8Array([1, 2, 3]);
    const signature = crypto.sign("sha256", data, {
      key: pair.privateKey.export({ format: "pem", type: "pkcs8" }),
      dsaEncoding: "ieee-p1363",
    });
    for (const view of [
      signature,
      new DataView(
        signature.buffer,
        signature.byteOffset,
        signature.byteLength,
      ),
      new Uint16Array(
        signature.buffer,
        signature.byteOffset,
        signature.byteLength / 2,
      ),
    ]) {
      result[
        "verify:" + (view === signature ? "Buffer" : view.constructor.name)
      ] = attempt(() =>
        crypto
          .createVerify("sha256")
          .update(data)
          .verify(
            {
              key: pair.publicKey.export({ format: "pem", type: "spki" }),
              dsaEncoding: "ieee-p1363",
            },
            view,
          ),
      );
    }
    for (const algorithm of ["sha3-256", "DSA-SHA", "sha256\0suffix"])
      result["oneShot:" + algorithm] = attempt(
        () => crypto.sign(algorithm, data, pair.privateKey).length > 0,
      );
    const ed = crypto.generateKeyPairSync("ed25519");
    const verifier = crypto.createVerify("sha256").update(data);
    result.ed = attempt(() =>
      verifier.verify(ed.publicKey, new Uint8Array(64)),
    );
    result.afterEd = attempt(() => {
      verifier.update(data);
      return true;
    });
    for (const type of ["pkcs1", "sec1"])
      result["export:" + type] = attempt(
        () => pair.privateKey.export({ format: "der", type }).length,
      );
    result.nulCurve = attempt(() => {
      crypto.createECDH("prime256v1\0suffix");
      return true;
    });
    return result;
  },
  fsReadLinesInventory: async function ({ fs }) {
    const path = "/tmp/read-lines-inventory";
    const attempt = (fn) => {
      try {
        fn();
        return "accepted";
      } catch (e) {
        return { name: e.name, message: e.message, code: e.code ?? null };
      }
    };
    await fs.promises.writeFile(path, "a\nb\n");
    const handle = await fs.promises.open(path, "r");
    try {
      const open = attempt(() => handle.readLines());
      await handle.close();
      return { open, closed: attempt(() => handle.readLines()) };
    } finally {
      await handle.close();
      await fs.promises.unlink(path);
    }
  },
  zlibCrcSeedInventory: function ({ zlib }) {
    return [
      -1,
      4294967296,
      1.5,
      NaN,
      Infinity,
      "1",
      null,
      undefined,
      0,
      4294967295,
    ].map((value) => {
      try {
        return zlib.crc32(new Uint8Array([1, 2]), value);
      } catch (e) {
        return { name: e.name, message: e.message, code: e.code ?? null };
      }
    });
  },

  cryptoDhContracts: function ({ crypto, withRequestScope = (fn) => fn() }) {
    return withRequestScope(() => {
      const attempt = (fn) => {
        try {
          return fn();
        } catch (e) {
          return {
            name: e.name,
            code: e.code ?? null,
            message: e.message.replace(
              /internal error; reference = .*/,
              "internal error",
            ),
          };
        }
      };
      const groups = [
        "modp14",
        "modp15",
        "modp16",
        "modp17",
        "modp18",
        "MODP14",
        "modp14\0suffix",
        "modp5",
        "modp1",
        "invalid",
      ].map((name) =>
        attempt(() => {
          const d = crypto.getDiffieHellman(name);
          return {
            length: d.getPrime().length,
            generator: d.getGenerator("hex"),
            verify: d.verifyError,
            setters: [typeof d.setPublicKey, typeof d.setPrivateKey],
          };
        }),
      );
      const errors = [
        () => crypto.createDiffieHellman(10001),
        () => crypto.createDiffieHellman(8, 100000),
        () => crypto.createDiffieHellman(8, new Uint8Array([2])),
        () => crypto.createDiffieHellman(new Uint8Array(1251)),
        () => crypto.createDiffieHellman(new Uint8Array(0)),
        () => crypto.createDiffieHellman(new Uint8Array([23]), 1),
        () =>
          crypto.createDiffieHellman(new Uint8Array([23]), new Uint8Array([1])),
        () =>
          crypto.createDiffieHellman(
            new Uint8Array([23]),
            new Uint8Array(1251),
          ),
        () => crypto.createDiffieHellman(new Uint8Array([22])),
        () => crypto.createDiffieHellman(new Uint8Array([3])).generateKeys(),
      ].map((fn) =>
        attempt(() => {
          fn();
          return "accepted";
        }),
      );
      const d = crypto.createDiffieHellman(new Uint8Array([23]));
      const before = [
        attempt(() => d.getPublicKey()),
        attempt(() => d.getPrivateKey()),
      ];
      d.setPrivateKey(new Uint8Array([3]));
      const pub = d.generateKeys("hex");
      const peer = crypto.createDiffieHellman(new Uint8Array([23]));
      peer.setPrivateKey(new Uint8Array([4]));
      peer.generateKeys();
      const secret = d.computeSecret(peer.getPublicKey(), undefined, "hex");
      const keyErrors = [
        new Uint8Array(0),
        new Uint8Array([0]),
        new Uint8Array([1]),
        new Uint8Array([23]),
      ].map((key) => [
        attempt(() => d.setPublicKey(key)),
        attempt(() => d.computeSecret(key)),
      ]);
      const numeric = crypto.createDiffieHellman(64);
      const numericResult = {
        length: numeric.getPrime().length,
        generator: numeric.getGenerator("hex"),
        verify: numeric.verifyError,
      };
      const properties = Object.getOwnPropertyNames(
        crypto.DiffieHellman.prototype,
      ).map((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(
          crypto.DiffieHellman.prototype,
          name,
        );
        return [
          name,
          descriptor.enumerable,
          descriptor.configurable,
          descriptor.writable ?? null,
          typeof descriptor.value === "function" ? descriptor.value.name : null,
        ];
      });
      const x = crypto.generateKeyPairSync("x25519"),
        y = crypto.generateKeyPairSync("x25519");
      const xSecret = crypto.diffieHellman({
        publicKey: x.publicKey,
        privateKey: y.privateKey,
      });
      const ec = crypto.generateKeyPairSync("ec", { namedCurve: "P-224" });
      const ecResult = attempt(() =>
        crypto.diffieHellman({
          publicKey: ec.publicKey,
          privateKey: ec.privateKey,
        }),
      );
      return {
        groups,
        errors,
        before,
        pub,
        secret,
        verify: d.verifyError,
        keyErrors,
        numericResult,
        properties,
        lengths: [
          crypto.DiffieHellman.length,
          crypto.createDiffieHellman.length,
        ],
        x25519: {
          length: xSecret.length,
          equal: xSecret.equals(
            crypto.diffieHellman({
              publicKey: y.publicKey,
              privateKey: x.privateKey,
            }),
          ),
        },
        ecResult,
      };
    });
  },

  cryptoRandomContracts: async function ({ crypto }) {
    const attempt = (fn) => {
      try {
        return fn();
      } catch (e) {
        return { name: e.name, code: e.code ?? null, message: e.message };
      }
    };
    const fills = [
      () => new Uint8Array(16),
      () => new Uint16Array(8),
      () => new Int32Array(4),
      () => new BigUint64Array(2),
      () => new DataView(new ArrayBuffer(24), 4, 16),
      () => new ArrayBuffer(16),
    ].map((make) => {
      const input = make();
      const result = crypto.randomFillSync(input, 1, 1);
      const whole = new Uint8Array(
        input instanceof ArrayBuffer ? input : input.buffer,
      );
      const start = (input.byteOffset ?? 0) + (input.BYTES_PER_ELEMENT ?? 1);
      const end = start + (input.BYTES_PER_ELEMENT ?? 1);
      return {
        length: result.byteLength,
        offset: result.byteOffset,
        brand: Object.prototype.toString.call(result),
        same: result === input,
        outsideZero: whole.every((v, i) => (i >= start && i < end) || v === 0),
      };
    });
    const errors = [
      () => crypto.randomBytes(-1),
      () => crypto.randomBytes(1.5),
      () => crypto.randomBytes("1"),
      () => crypto.randomFillSync("x"),
      () => crypto.randomFillSync(new Uint8Array(2), -1),
      () => crypto.randomFillSync(new Uint8Array(2), 0, 3),
      () => crypto.randomFill(new Uint8Array(2), 3, () => {}),
      () => crypto.randomFill(new Uint8Array(2), null),
      () => crypto.randomBytes(0, null),
    ].map((fn) => attempt(fn));
    const brandChecks = [
      { [Symbol.toStringTag]: "ArrayBuffer", byteLength: 1 },
      {
        [Symbol.toStringTag]: "DataView",
        byteLength: 1,
        buffer: new ArrayBuffer(1),
        byteOffset: 0,
      },
      Object.defineProperty(new ArrayBuffer(0), Symbol.toStringTag, {
        value: "Object",
      }),
      Object.defineProperty(
        new DataView(new ArrayBuffer(0)),
        Symbol.toStringTag,
        { value: "Object" },
      ),
    ].map((input) => attempt(() => crypto.randomFillSync(input).byteLength));
    const beyond = crypto.randomFillSync(new Uint8Array(2), 3);
    const hostErrors = [
      () => crypto.randomFillSync(new Float32Array(2)),
      () => crypto.randomBytes(65537),
    ].map((fn) => {
      try {
        fn();
        return "accepted";
      } catch (e) {
        return e.name;
      }
    });
    const order = [],
      input = new DataView(new ArrayBuffer(32), 8, 16);
    const callback = await new Promise((resolve) => {
      const result = crypto.randomFill(input, 2, 4, (error, value) => {
        order.push("callback");
        resolve({ error: error?.name ?? null, same: value === input });
      });
      order.push("sync");
      if (result !== undefined)
        throw new Error("randomFill must return undefined");
    });
    const empty = await new Promise((resolve) =>
      crypto.randomBytes(0, (error, value) =>
        resolve({ error: error?.name ?? null, length: value.length }),
      ),
    );
    let detachedName;
    try {
      const get = crypto.webcrypto.getRandomValues;
      get(new Uint8Array(1));
    } catch (e) {
      detachedName = e.name;
    }
    const get = crypto.getRandomValues;
    return {
      fills,
      brandChecks,
      errors,
      hostErrors,
      beyond: beyond.byteLength,
      callback,
      order,
      empty,
      detachedName,
      boundLength: get(new Uint8Array(1)).length,
      aliases: [
        crypto.pseudoRandomBytes === crypto.randomBytes,
        crypto.default.pseudoRandomBytes === crypto.randomBytes,
      ],
      extraAliases: ["prng", "rng", "listCiphers", "createCredentials"].map(
        (name) => [name in crypto, name in crypto.default],
      ),
      aliasError: attempt(() => crypto.pseudoRandomBytes(-1)),
    };
  },

  cryptoWorkLimits: async function ({ crypto }) {
    const attempt = (fn) => {
      try {
        return fn();
      } catch (error) {
        return {
          name: error.name,
          code: error.code ?? null,
          message: error.message,
        };
      }
    };
    const options = [
      { N: 1024, r: 1, p: 32768 },
      { N: 2, r: 1, p: 1048577 },
      { N: 65536, r: 1, p: 1 },
      { N: 16, r: 1, p: 1, maxmem: 1 },
      { N: 16, r: 1, p: 1, maxmem: 4294967296 },
      { N: 16, r: 1, p: 1, maxmem: 4294967295 },
      { N: 16, r: 1, p: 1 },
    ];
    const result = {
      scrypt: options.map((options) =>
        attempt(() => crypto.scryptSync("p", "s", 8, options).toString("hex")),
      ),
      rsa: attempt(() =>
        crypto.generateKeyPairSync("rsa", { modulusLength: 16385 }),
      ),
      dh: attempt(() =>
        crypto.generateKeyPairSync("dh", { prime: new Uint8Array(1025) }),
      ),
    };
    const order = [];
    result.callback = await new Promise((resolve) => {
      crypto.scrypt("p", "s", 8, options[0], (error) => {
        order.push("callback");
        resolve({
          name: error.name,
          code: error.code ?? null,
          message: error.message,
        });
      });
      order.push("returned");
    });
    result.order = order;
    return result;
  },
  cryptoKeygenContracts: async function ({ crypto, util }) {
    const attempt = (fn) => {
      try {
        return fn();
      } catch (error) {
        return {
          name: error.name,
          code: error.code ?? null,
          message: error.message,
        };
      }
    };
    const errors = [
      ["dh", {}],
      ["dh", { prime: "p" }],
      ["dh", { primeLength: -1 }],
      ["dh", { primeLength: 512 }],
      ["dh", { generator: -1 }],
      ["dh", { group: "modp14", primeLength: 512 }],
      ["dh", { group: "modp14", prime: new Uint8Array([3]) }],
      ["dh", { group: "modp14", generator: 2 }],
      ["dh", { prime: new Uint8Array([3]), primeLength: 512 }],
      ["dh", { group: "modp1" }],
      ["dh", { group: "unknown" }],
      ["ed25519", { publicKeyEncoding: "pem" }],
      ["x25519", { privateKeyEncoding: "pem" }],
      ["ed25519", { privateKeyEncoding: { format: "pem", type: "pkcs1" } }],
      [
        "rsa",
        {
          modulusLength: 1024,
          privateKeyEncoding: {
            format: "der",
            type: "pkcs1",
            cipher: "aes-128-cbc",
            passphrase: "pw",
          },
        },
      ],
      [
        "ec",
        {
          namedCurve: "prime256v1",
          privateKeyEncoding: {
            format: "pem",
            type: "pkcs8",
            cipher: "aes-128-cbc",
          },
        },
      ],
    ].map(([type, options]) =>
      attempt(() => {
        crypto.generateKeyPairSync(type, options);
        return "accepted";
      }),
    );
    const rsaBoundaries = [0, 1, 16, 255, 256, 511].map((modulusLength) =>
      attempt(() => {
        crypto.generateKeyPairSync("rsa", { modulusLength });
        return "accepted";
      }),
    );
    const rsaRounded = [513, 520, 639, 640, 1023].map(
      (modulusLength) =>
        crypto.generateKeyPairSync("rsa", { modulusLength }).privateKey
          .asymmetricKeyDetails.modulusLength,
    );
    const rsaExponents = [0, 1, 2, 4].map((publicExponent) =>
      attempt(() => {
        crypto.generateKeyPairSync("rsa", {
          modulusLength: 512,
          publicExponent,
        });
        return "accepted";
      }),
    );
    const smallDh = [0, 1, 2, 3, 5, 23, 37, 255].map((p) =>
      attempt(() => {
        const { publicKey, privateKey } = crypto.generateKeyPairSync("dh", {
          prime: new Uint8Array([p]),
          generator: 2,
        });
        return [
          publicKey.asymmetricKeyType,
          privateKey.asymmetricKeyType,
          crypto.createPublicKey(privateKey).type,
          attempt(
            () => publicKey.export({ type: "spki", format: "der" }).length > 0,
          ),
          attempt(
            () =>
              privateKey.export({ type: "pkcs8", format: "der" }).length > 0,
          ),
        ];
      }),
    );
    const curves = [
      "P-224",
      "P-256",
      "P-384",
      "P-521",
      "prime256v1",
      "prime256v1\0suffix",
      "secp256r1",
      "secp256k1",
      "PRIME256V1",
    ].map((namedCurve) => [
      namedCurve,
      attempt(
        () =>
          crypto.generateKeyPairSync("ec", { namedCurve }).publicKey
            .asymmetricKeyDetails,
      ),
    ]);
    const ecEncoding = ["named", "explicit"].map((paramEncoding) => {
      const { privateKey } = crypto.generateKeyPairSync("ec", {
        namedCurve: "P-256",
        paramEncoding,
      });
      const data = privateKey.export({ type: "sec1", format: "der" });
      return {
        paramEncoding,
        length: data.length,
        curveParameter: data
          .toString("hex")
          .includes("a00a06082a8648ce3d030107"),
      };
    });
    const alice = crypto.generateKeyPairSync("dh", { group: "MODP14" });
    const prime = crypto.getDiffieHellman("modp14").getPrime(),
      padded = new Uint8Array(prime.length + 4);
    padded.set(prime, 2);
    const bob = crypto.generateKeyPairSync("dh", {
      prime: new DataView(padded.buffer, 2, prime.length),
      generator: 2,
    });
    const a = crypto.diffieHellman({
        privateKey: alice.privateKey,
        publicKey: bob.publicKey,
      }),
      b = crypto.diffieHellman({
        privateKey: bob.privateKey,
        publicKey: alice.publicKey,
      });
    const mismatchedDh = [
      crypto.generateKeyPairSync("dh", { group: "modp5" }),
      crypto.generateKeyPairSync("dh", { prime, generator: 5 }),
    ].map((peer) =>
      attempt(
        () =>
          crypto.diffieHellman({
            publicKey: alice.publicKey,
            privateKey: peer.privateKey,
          }).length,
      ),
    );
    const clonedDh = crypto
      .diffieHellman({
        publicKey: crypto.createPublicKey(bob.privateKey),
        privateKey: alice.privateKey,
      })
      .equals(a);
    const pair = await util.promisify(crypto.generateKeyPair)("ed25519", {});
    return {
      errors,
      curves,
      ecEncoding,
      rsaBoundaries,
      rsaExponents,
      rsaRounded,
      smallDh,
      mismatchedDh,
      clonedDh,
      dh: {
        type: alice.privateKey.asymmetricKeyType,
        length: a.length,
        equal: a.toString("hex") === b.toString("hex"),
      },
      promisify: [pair.publicKey.type, pair.privateKey.type],
    };
  },

  cryptoCipherAlgorithms: async function ({ crypto }) {
    const results = [];
    for (const name of [
      ...new Set(
        crypto.getCiphers().flatMap((name) => [name, name.toUpperCase()]),
      ),
    ].sort())
      for (const authLengthTag of [undefined, 16, 8, 4, 28]) {
        const info = crypto.getCipherInfo(name),
          result = { name, authLengthTag: authLengthTag ?? null };
        let stage = "construct";
        try {
          const key = new Uint8Array(info.keyLength),
            iv = new Uint8Array(info.ivLength);
          const cipher = crypto.createCipheriv(name, key, iv, {
            authLengthTag,
          });
          stage = "aad";
          try {
            cipher.setAAD("aad", { plaintextLength: 5 });
            result.aad = true;
          } catch (error) {
            result.aad = error.message;
          }
          stage = "update";
          const first = cipher.update("hello", "utf8");
          stage = "final";
          const last = cipher.final();
          stage = "tag";
          const tag = cipher.getAuthTag();
          const ciphertext = new Uint8Array(first.length + last.length);
          ciphertext.set(first);
          ciphertext.set(last, first.length);
          const hex = (value) =>
            Array.from(value, (byte) =>
              byte.toString(16).padStart(2, "0"),
            ).join("");
          result.data = name.toLowerCase().includes("randnonce")
            ? ciphertext.length
            : hex(ciphertext);
          result.tag = name.toLowerCase().includes("randnonce")
            ? tag.length
            : hex(tag);
          result.secondTag = cipher.getAuthTag().length;
          stage = "decrypt";
          const decipher = crypto.createDecipheriv(name, key, iv, {
            authLengthTag,
          });
          if (tag.length) decipher.setAuthTag(tag);
          if (result.aad === true)
            decipher.setAAD("aad", { plaintextLength: 5 });
          result.plain =
            decipher.update(ciphertext).toString() +
            decipher.final().toString();
          if (tag.length) {
            const invalid = crypto.createDecipheriv(name, key, iv, {
              authLengthTag,
            });
            const damaged = new Uint8Array(tag);
            damaged[0] ^= 1;
            invalid.setAuthTag(damaged);
            if (result.aad === true)
              invalid.setAAD("aad", { plaintextLength: 5 });
            try {
              invalid.update(ciphertext);
              invalid.final();
              result.tamper = "accepted";
            } catch (error) {
              result.tamper = {
                name: error.name,
                code: error.code ?? null,
                message: error.message.replace(
                  /internal error; reference = .*/,
                  "internal error",
                ),
              };
            }
          }
        } catch (error) {
          result.error = {
            stage,
            name: error.name,
            code: error.code ?? null,
            message: error.message.replace(
              /internal error; reference = .*/,
              "internal error",
            ),
          };
        }
        results.push(result);
      }
    return results;
  },
  cryptoCipherStates: async function ({ crypto }) {
    const attempt = (operation) => {
      try {
        const result = operation();
        return result?.byteLength ?? typeof result;
      } catch (error) {
        return {
          name: error.name,
          code: error.code ?? null,
          message: error.message.replace(
            /internal error; reference = .*/,
            "internal error",
          ),
        };
      }
    };
    const result = [];
    for (const name of [
      "aes-128-cbc",
      "aes-128-gcm",
      "chacha20-poly1305",
      "aes-128-eax",
    ]) {
      const info = crypto.getCipherInfo(name),
        key = new Uint8Array(info.keyLength),
        iv = new Uint8Array(info.ivLength);
      const cipher = crypto.createCipheriv(name, key, iv, {
        authLengthTag: 16,
      });
      const row = {
        name,
        before: attempt(() => cipher.getAuthTag()),
        stringInput: attempt(() => cipher.update("abc")),
        aad: attempt(() => cipher.setAAD(new Uint8Array([1, 2, 3]))),
      };
      row.update = attempt(() => cipher.update(new Uint8Array([1, 2, 3])));
      row.secondUpdate = attempt(() => cipher.update(new Uint8Array([4])));
      row.final = attempt(() => cipher.final());
      row.tag = attempt(() => cipher.getAuthTag());
      row.tagAgain = attempt(() => cipher.getAuthTag());
      row.finalAgain = attempt(() => cipher.final());
      row.updateAfterFinal = attempt(() => cipher.update(new Uint8Array()));
      row.aadAfterFinal = attempt(() => cipher.setAAD(new Uint8Array()));
      row.paddingAfterFinal = attempt(() => cipher.setAutoPadding());
      const decipher = crypto.createDecipheriv(name, key, iv, {
        authLengthTag: 16,
      });
      row.stringTag = attempt(() => decipher.setAuthTag("00", "hex"));
      row.missingTag = attempt(() =>
        decipher.update(new Uint8Array([1, 2, 3])),
      );
      row.setTag = attempt(() => decipher.setAuthTag(new Uint8Array(16)));
      row.setTagAgain = attempt(() => decipher.setAuthTag(new Uint8Array(16)));
      row.decryptFinal = attempt(() => decipher.final());
      result.push(row);
    }
    result.push({
      invalidNames: [
        "aes_128_eax",
        "aes-128-eax\0suffix",
        "AES-128-EAX",
        "aes-128-cbc\0suffix",
        "unknown",
      ].map((name) => [
        name,
        attempt(() =>
          crypto.createCipheriv(name, new Uint8Array(16), new Uint8Array(16), {
            authLengthTag: 16,
          }),
        ),
      ]),
    });
    const changingKey = new Uint8Array(16);
    const keyCopy = crypto.createCipheriv(
      "aes-128-cbc",
      changingKey,
      new Uint8Array(16),
      {
        get authLengthTag() {
          changingKey[0] = 1;
          return 16;
        },
      },
    );
    result.push({
      keyCopiedBeforeOptions:
        keyCopy.update("hello", "utf8", "hex") + keyCopy.final("hex"),
    });
    result.push({
      deprecated: ["Cipher", "Decipher", "createCipher", "createDecipher"].map(
        (name) => [name, attempt(() => crypto[name]())],
      ),
    });
    return result;
  },

  cryptoPbkdfContracts: async function ({ crypto }) {
    const attempt = (fn) => {
      try {
        return fn();
      } catch (error) {
        return { name: error.name, code: error.code ?? null };
      }
    };
    const result = { algorithms: [], typed: [], errors: [] };
    for (const name of crypto.getHashes())
      result.algorithms.push([
        name,
        crypto.pbkdf2Sync("pass", "salt", 3, 20, name).toString("hex"),
      ]);
    for (const Constructor of [
      Uint8Array,
      Uint16Array,
      Uint32Array,
      Float32Array,
      Float64Array,
    ]) {
      const value = new Constructor(new ArrayBuffer(16));
      value.set([1, 2]);
      result.typed.push([
        Constructor.name,
        crypto
          .pbkdf2Sync(value, new DataView(value.buffer, 2, 6), 2, 8, "sha256")
          .toString("hex"),
      ]);
    }
    // Half-float bytes are portable; the Float16Array input brand is tested
    // only where the engine provides it, and native evidence records availability.
    const halfBytes = new Uint8Array(16);
    new DataView(halfBytes.buffer).setUint16(0, 0x3c00, true);
    new DataView(halfBytes.buffer).setUint16(2, 0x4000, true);
    result.halfFloatBytes = crypto
      .pbkdf2Sync(
        halfBytes,
        new DataView(halfBytes.buffer, 2, 6),
        2,
        8,
        "sha256",
      )
      .toString("hex");
    if (typeof globalThis.Float16Array === "function") {
      const half = new globalThis.Float16Array(8);
      half.set([1, 2]);
      const actual = crypto
        .pbkdf2Sync(half, new DataView(half.buffer, 2, 6), 2, 8, "sha256")
        .toString("hex");
      if (actual !== result.halfFloatBytes)
        throw new Error(
          "Float16Array PBKDF2 differs from its byte representation",
        );
    }
    for (const args of [
      ["p", "s", 0, 1, "sha1"],
      ["p", "s", 1, 5101, "sha1"],
      ["p", "s", 1, 8161, "sha256"],
      ["p", "s", 1, 0, "sha256"],
      ["p", "s", 1, 1, "unknown"],
    ])
      result.errors.push(
        attempt(() => crypto.pbkdf2Sync(...args).toString("hex")),
      );
    const order = [];
    result.callback = await new Promise((resolve) => {
      crypto.pbkdf2("p", "s", 2, 8, "sha256", (error, value) => {
        order.push("callback");
        resolve(error ? error.name : value.toString("hex"));
      });
      order.push("returned");
    });
    result.order = order;
    result.callbackError = await new Promise((resolve) =>
      crypto.pbkdf2("p", "s", 1, 1, "unknown", (error) =>
        resolve([error.name, error.code ?? null]),
      ),
    );
    const hex = (buffer) =>
      Array.from(new Uint8Array(buffer), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
    result.hkdf = crypto
      .getHashes()
      .map((name) => [
        name,
        hex(
          crypto.hkdfSync(
            name,
            crypto.createSecretKey(new Uint8Array([1, 2, 3])),
            "salt",
            "info",
            10,
          ),
        ),
      ]);
    result.hkdfErrors = [
      attempt(() => crypto.hkdfSync("unknown", "p", "s", "i", 1)),
      attempt(() => crypto.hkdfSync("sha1", "p", "s", "i", 5101)),
      attempt(() => crypto.hkdfSync("sha1", "p", "s", new Uint8Array(1025), 1)),
    ];
    return result;
  },
  cryptoDigestContracts: async function ({ crypto }) {
    const attempt = (fn) => {
      try {
        return fn();
      } catch (error) {
        return { name: error.name, code: error.code ?? null };
      }
    };
    const result = { names: crypto.getHashes(), algorithms: [], errors: [] };
    for (const name of result.names) {
      const hash = crypto.createHash(name).update("a");
      const copy = hash.copy();
      result.algorithms.push({
        name,
        hash: hash.update("bc").digest("hex"),
        copy: copy.update("d").digest("hex"),
        hmac: attempt(() =>
          crypto.createHmac(name, "key").update("abc").digest("hex"),
        ),
      });
    }
    for (const name of [
      "ripemd160",
      "sha-256",
      "SHA",
      "ssl3-md5",
      "ssl3-sha1",
      "SHA256",
    ])
      result.errors.push([
        name,
        attempt(() => crypto.createHash(name).digest("hex")),
      ]);
    for (const outputLength of [0, 28, 32, null, -1, "32"])
      result.errors.push(
        attempt(() =>
          crypto.createHash("sha256", { outputLength }).digest("hex"),
        ),
      );
    const hash = crypto.createHash("sha256");
    hash.end("abc");
    result.stream = [hash.read().toString("hex"), hash.digest("hex")];
    result.final = [
      attempt(() => hash.copy()),
      attempt(() => hash.update("x")),
      attempt(() => hash.digest()),
    ];
    const hmac = crypto.Hmac(
      "sha256",
      crypto.createSecretKey(new Uint8Array([1, 2, 3])),
    );
    hmac.end("abc");
    result.hmacStream = [
      hmac.read().toString("hex"),
      hmac.digest("hex"),
      hmac.digest("hex"),
      attempt(() => hmac.update("x")),
    ];
    return result;
  },
  fsIoContracts: async function ({ fs, process }) {
    const path = "/tmp/io-contract",
      result = {};
    fs.writeFileSync(path, "abc");
    const fd = fs.openSync(path, "a+");
    fs.writeFileSync(fd, "def");
    result.full = fs.readFileSync(fd, "utf8");
    result.after = fs.readSync(fd, new Uint8Array(1));
    fs.closeSync(fd);
    fs.closeSync(fd);
    fs.closeSync(123456);
    const callbackFd = await new Promise((resolve, reject) =>
      fs.open(path, fs.constants.O_TRUNC, (error, fd) =>
        error ? reject(error) : resolve(fd),
      ),
    );
    fs.closeSync(callbackFd);
    const promiseHandle = await fs.promises.open(path, fs.constants.O_TRUNC);
    await promiseHandle.close();
    result.readonlyTruncate = fs.readFileSync(path, "utf8");
    process.chdir("/tmp");
    try {
      result.cwd = process.cwd();
      fs.writeFileSync("relative-io", "data");
      result.relative = fs.readFileSync("/tmp/relative-io", "utf8");
    } finally {
      process.chdir("/bundle");
    }
    result.errors = [];
    for (const call of [
      () => fs.writeSync(1, "x", ""),
      () => fs.writeSync(1, new Uint8Array(1), { offset: 2 }),
      () => fs.ftruncateSync(1, -1),
      () => fs.appendFileSync(path, []),
      () => fs.copyFile(path, path, 123),
      () => fs.readFile(path),
    ]) {
      try {
        call();
        result.errors.push(null);
      } catch (error) {
        result.errors.push(error.code);
      }
    }
    result.constants = [
      Object.getPrototypeOf(fs.constants) === null,
      fs.constants.UV_FS_COPYFILE_EXCL,
    ];
    return result;
  },
  fsStreamsAndLinks: async function ({ fs }) {
    const root = "/tmp/streams-links";
    fs.mkdirSync(root);
    const path = root + "/data";
    fs.writeFileSync(path, "abcdef");
    fs.symlinkSync(path, root + "/link");
    fs.cpSync(root + "/link", root + "/copy");
    const result = {
      link: fs.readlinkSync(root + "/copy"),
      text: fs.readFileSync(root + "/copy", "utf8"),
    };
    fs.symlinkSync(root + "/missing", root + "/broken");
    fs.cpSync(root + "/broken", root + "/broken-copy");
    result.broken = fs.realpathSync(root + "/broken-copy");
    const handle = await fs.promises.open(path, "r");
    const stream = handle.createReadStream({
      start: 1,
      end: 3,
      encoding: "utf8",
    });
    let text = "";
    for await (const chunk of stream) text += chunk;
    result.read = [
      text,
      handle.fd === undefined,
      stream.bytesRead,
      stream.closed,
    ];
    const output = fs.createWriteStream(root + "/output");
    const finished = new Promise((resolve, reject) => {
      output.on("close", resolve);
      output.on("error", reject);
    });
    output.cork();
    output.write("one");
    output.write("two");
    output.uncork();
    output.end("three");
    await finished;
    result.write = [
      fs.readFileSync(root + "/output", "utf8"),
      output.bytesWritten,
      output.closed,
    ];
    const webHandle = await fs.promises.open(path, "r");
    let webText = "";
    for await (const chunk of webHandle.readableWebStream())
      webText += new TextDecoder().decode(chunk);
    result.web = [webText, webHandle.fd === undefined];
    const aborted = await fs.promises.open(path, "r");
    const closed = new Promise((resolve) => aborted.once("close", resolve));
    const abortedStream = aborted.createReadStream({
      signal: AbortSignal.abort(),
    });
    result.abort = await new Promise((resolve) =>
      abortedStream.once("error", (error) => resolve(error.name)),
    );
    await closed;
    result.closed = aborted.fd === undefined;
    fs.writeFileSync(root + "/%64ata%3f", "encoded");
    result.normalized = fs.readFileSync(root + "/data%3F", "utf8");
    return result;
  },
  fsDevicesAndBounds: async function ({ fs }) {
    const attempt = (fn) => {
      try {
        return fn() ?? null;
      } catch (error) {
        return { name: error.name, code: error.code ?? null };
      }
    };
    const result = { devices: [], limits: [], times: [] };
    for (const name of ["null", "zero", "full", "random"]) {
      const path = "/dev/" + name,
        fd = fs.openSync(path, "r+"),
        buffer = new Uint8Array(4).fill(7);
      const read = fs.readSync(fd, buffer, 0, 4, null),
        stat = fs.fstatSync(fd);
      result.devices.push({
        name,
        read,
        buffer: name === "random" ? "entropy" : Array.from(buffer),
        write: attempt(() => fs.writeSync(fd, "abc")),
        truncate: attempt(() => fs.ftruncateSync(fd, 0)),
        stat: [
          stat.mode,
          stat.dev,
          stat.size,
          stat.isCharacterDevice(),
          stat.isFile(),
          stat.mtimeMs,
        ],
        all: fs.readFileSync(path).length,
      });
      fs.closeSync(fd);
    }
    const path = "/tmp/bounds",
      fd = fs.openSync(path, "w+");
    result.times.push(fs.fstatSync(fd).mtimeMs);
    fs.writeSync(fd, "x");
    result.times.push(fs.fstatSync(fd).mtimeMs);
    fs.futimesSync(fd, 123, 456);
    fs.writeSync(fd, "y");
    result.times.push(fs.fstatSync(fd).mtimeMs);
    result.limits.push(
      attempt(() => fs.writeSync(fd, new Uint8Array(1), 0, 1, 134217728)),
    );
    fs.closeSync(fd);
    result.limits.push(
      attempt(() => fs.openSync("/tmp/" + "a".repeat(4097), "r")),
    );
    result.limits.push(attempt(() => fs.openSync("/a".repeat(49), "r")));
    const blob = fs.openAsBlob(path, { type: "text/plain" });
    result.blob = [
      blob instanceof Blob,
      blob.size,
      blob.type,
      await blob.text(),
    ];
    return result;
  },
  fsDirectoryNavigation: async function ({ fs }) {
    const root = "/tmp/navigation";
    const created = fs.mkdirSync(root + "/a/nested", { recursive: true });
    fs.mkdirSync(root + "/a/nested");
    for (const name of ["a/one", "a/.hidden", "a/nested/two"])
      fs.writeFileSync(root + "/" + name, "data");
    const describe = (entry) => ({
      name:
        typeof entry.name === "string" ? entry.name : Array.from(entry.name),
      parent: entry.parentPath,
      file: entry.isFile(),
      dir: entry.isDirectory(),
      link: entry.isSymbolicLink(),
      instance: entry instanceof fs.Dirent,
    });
    const result = {
      created,
      listing: fs.readdirSync(root, { recursive: true }),
      entries: fs
        .readdirSync(root, { recursive: true, withFileTypes: true })
        .map(describe),
      patterns: [],
    };
    for (const pattern of [
      "**",
      "a/*",
      "a/**",
      "a/{one,nested/**}",
      "a/+(one|nested)",
      "**/.hidden",
      ["a/one", "a/nested/*"],
    ])
      result.patterns.push(fs.globSync(pattern, { cwd: root }));
    result.exclude = fs.globSync("**", {
      cwd: root,
      exclude: ["**/nested/**"],
    });
    result.typed = fs
      .globSync("a/*", { cwd: root, withFileTypes: true })
      .map(describe);
    result.callback = await new Promise((resolve, reject) =>
      fs.glob("a/**", { cwd: root }, (e, value) =>
        e ? reject(e) : resolve(value),
      ),
    );
    result.promise = [];
    for await (const value of fs.promises.glob("a/**", { cwd: root }))
      result.promise.push(value);
    const dir = await fs.promises.opendir(root, { recursive: true });
    result.iterated = [];
    for await (const entry of dir) result.iterated.push(describe(entry));
    result.afterIteration = dir.readSync();
    await dir.close();
    try {
      dir.readSync();
    } catch (error) {
      result.closed = error.code;
    }
    result.encoded = fs.readdirSync(root, "hex");
    result.bundle = fs
      .readdirSync("/bundle/nested", { withFileTypes: true })
      .map(describe);
    for (const options of [
      { encoding: null },
      { recursive: 1 },
      { withFileTypes: 1 },
    ]) {
      try {
        fs.readdirSync(root, options);
        result.patterns.push(null);
      } catch (error) {
        result.patterns.push(error.code);
      }
    }
    return result;
  },
  fsTimes: async function ({ fs }) {
    const readonly = "/bundle/readonly.txt",
      writable = "/tmp/time-file";
    fs.writeFileSync(writable, "x");
    const result = [];
    for (const path of [readonly, writable]) {
      fs.utimesSync(path, 1000, 2000);
      result.push(fs.statSync(path).mtimeMs);
      const fd = fs.openSync(path, "r");
      fs.futimesSync(fd, 3000n, new Date(4000));
      result.push(fs.fstatSync(fd).mtimeMs);
      fs.closeSync(fd);
      const handle = await fs.promises.open(path, "r");
      await handle.utimes(new Date(5000), 6000);
      result.push((await handle.stat()).mtimeMs);
      await handle.close();
      for (const method of ["writeFile", "truncate"]) {
        try {
          await handle[method](method === "writeFile" ? "x" : 0);
          result.push(null);
        } catch (error) {
          result.push(error.code);
        }
      }
      for (const value of [null, {}, true, undefined]) {
        try {
          fs.utimesSync(path, value, 0);
          result.push(null);
        } catch (e) {
          result.push(e.code);
        }
      }
    }
    return result;
  },
  cipherMetadata: async function ({ crypto: c }) {
    const results = [];
    for (const name of [
      "aes-128-cbc",
      "AES-192-CTR",
      "aes-256-gcm",
      "des-ede3-cbc",
      "rc2-cbc",
      "rc4",
      "chacha20-poly1305",
      "aes-128-ccm-matter",
      "unknown",
      419,
      419.8,
      950,
      0,
      NaN,
    ]) {
      for (const options of [
        {},
        { ivLength: 0 },
        { ivLength: 1 },
        { ivLength: 16 },
        { ivLength: -1 },
        { ivLength: NaN },
        { ivLength: "12" },
        { keyLength: 0 },
        { keyLength: 1 },
        { keyLength: 16 },
        { keyLength: 32 },
        null,
        3,
      ]) {
        try {
          results.push(c.getCipherInfo(name, options) ?? null);
        } catch (e) {
          results.push({ error: e.name, code: e.code ?? null });
        }
      }
    }
    for (const input of [null, {}, true, [], undefined]) {
      try {
        results.push(c.getCipherInfo(input) ?? null);
      } catch (e) {
        results.push({ error: e.name, code: e.code ?? null });
      }
    }
    const first = c.getCipherInfo("aes-128-cbc");
    first.keyLength = 999;
    results.push(c.getCipherInfo("aes-128-cbc"));
    return results;
  },
  codecLifecycle: async function ({ zlib: z }) {
    const failure = (error) => ({ name: error.name, code: error.code ?? null });
    const result = { options: [], callbacks: [], lifecycle: [] };
    for (const name of ["brotli", "zstd"]) {
      const Constructor =
        z[name === "brotli" ? "BrotliCompress" : "ZstdCompress"];
      const compress = z[name + "CompressSync"];
      for (const options of [
        { chunkSize: null },
        { chunkSize: NaN },
        { chunkSize: 63 },
        { chunkSize: 64.5 },
        { flush: -1 },
        { flush: 6 },
        { finishFlush: -1 },
        { maxOutputLength: 0 },
        { maxOutputLength: 1 },
        { params: { 999: 1 } },
        { params: { 1: "bad" } },
        { params: { 1: 2, "01": 1 } },
        { params: null },
        null,
        3,
      ]) {
        for (const mode of ["fast", "info", "stream"]) {
          try {
            const value =
              mode === "stream"
                ? new Constructor(options)
                : compress(
                    "hello",
                    mode === "info" ? { ...options, info: true } : options,
                  );
            value.destroy?.();
            result.options.push(null);
          } catch (error) {
            result.options.push(failure(error));
          }
        }
      }
      for (const options of [
        { chunkSize: 63 },
        { chunkSize: NaN },
        { params: null },
        { params: { 999: 1 } },
        {},
      ]) {
        let returned = false;
        const pending = new Promise((resolve) => {
          try {
            z[name + "Compress"]("hello", options, (error) =>
              resolve({
                when: "callback",
                returned,
                error: error ? failure(error) : null,
              }),
            );
          } catch (error) {
            resolve({ when: "throw", returned, error: failure(error) });
          }
        });
        returned = true;
        result.callbacks.push(await pending);
      }
    }
    for (const name of [
      "Deflate",
      "Inflate",
      "Gzip",
      "Gunzip",
      "DeflateRaw",
      "InflateRaw",
      "Unzip",
      "BrotliCompress",
      "BrotliDecompress",
      "ZstdCompress",
      "ZstdDecompress",
    ]) {
      const stream = new z[name]();
      stream.bytesRead = 7;
      const before = [stream.bytesWritten, stream.bytesRead, stream._closed];
      stream.reset();
      const afterReset = [stream.bytesWritten, stream.bytesRead];
      let closes = 0;
      stream.on("close", () => closes++);
      const closed = new Promise((resolve) =>
        stream.close((error) => resolve(error?.code ?? null)),
      );
      stream.destroy();
      const closeCode = await closed;
      let resetError;
      try {
        stream.reset();
      } catch (error) {
        resetError = failure(error);
      }
      result.lifecycle.push({
        name,
        before,
        afterReset,
        closed: stream._closed,
        destroyed: stream.destroyed,
        closes,
        closeCode,
        resetError,
      });
    }
    const unzip = new z.Unzip();
    const decoded = [];
    unzip.on("data", (chunk) => decoded.push(chunk.toString()));
    const write = (input) =>
      new Promise((resolve, reject) =>
        unzip.write(input, (error) => (error ? reject(error) : resolve())),
      );
    await write(z.deflateSync("first"));
    unzip.reset();
    await write(z.gzipSync("second"));
    await write(z.gzipSync("third"));
    unzip.destroy();
    result.resetFormats = decoded.join("");
    return result;
  },

  fsEmbedded: async function ({ fs }) {
    const path = "/bundle/readonly.txt";
    const attempt = (fn) => {
      try {
        return fn() ?? null;
      } catch (error) {
        return { code: error.code };
      }
    };
    const fd = fs.openSync(path, "r");
    const buffer = new Uint8Array(3);
    const read = fs.readSync(fd, buffer, 0, 3, 1);
    const result = {
      read,
      buffer: Array.from(buffer),
      mode: fs.fstatSync(fd).mode,
      write: attempt(() => fs.writeSync(fd, "x")),
      truncate: attempt(() => fs.ftruncateSync(fd, 0)),
    };
    fs.closeSync(fd);
    result.openWrite = attempt(() => fs.openSync(path, "r+"));
    const handle = await fs.promises.open(path, "r");
    result.promiseRead = await handle.readFile("utf8");
    try {
      await handle.truncate(0);
    } catch (error) {
      result.promiseTruncate = error.code;
    }
    await handle.close();
    fs.symlinkSync(path, "/tmp/readonly-link");
    result.link = fs.readlinkSync("/tmp/readonly-link");
    result.linkRead = fs.readFileSync("/tmp/readonly-link", "utf8");
    result.linkMode = fs.statSync("/tmp/readonly-link").mode;
    result.linkAccess = attempt(() =>
      fs.accessSync("/tmp/readonly-link", fs.constants.W_OK),
    );
    result.linkWrite = attempt(() =>
      fs.writeFileSync("/tmp/readonly-link", "changed"),
    );
    let text = "";
    for await (const chunk of fs.createReadStream(path, { start: 1, end: 3 }))
      text += chunk.toString();
    result.stream = text;
    result.content = fs.readFileSync(path, "hex");
    fs.unlinkSync("/tmp/readonly-link");
    fs.linkSync(path, "/tmp/hard-link");
    result.hardRead = fs.readFileSync("/tmp/hard-link", "utf8");
    result.hardWrite = attempt(() =>
      fs.writeFileSync("/tmp/hard-link", "changed"),
    );
    result.hardMetadata = [
      fs.statSync("/tmp/hard-link").nlink,
      fs.statSync("/tmp/hard-link").ino,
      fs.statSync("/tmp/hard-link").mode,
    ];
    await fs.promises.cp("/bundle/nested", "/tmp/copied", { recursive: true });
    result.copied = fs.readFileSync("/tmp/copied/child.txt", "utf8");
    fs.writeFileSync("/tmp/copied/child.txt", "changed copy");
    result.unchanged = fs.readFileSync("/bundle/nested/child.txt", "utf8");
    result.filter = attempt(() =>
      fs.cpSync(path, "/tmp/filtered", { filter: () => true }),
    );
    result.readonlyMutation = attempt(() => fs.writeFileSync(path, "changed"));
    const big = fs.statSync(path, { bigint: true });
    result.bigintMetadata = [
      big.size,
      big.mode,
      big.ino,
      big.nlink,
      big.atimeNs,
    ].map(String);
    return result;
  },

  classicCodecs: async function ({ zlib: z }) {
    const result = { roundtrips: [], validation: [], streams: [] };
    const failure = (error) => ({ name: error.name, code: error.code ?? null });
    const source = new Uint8Array([0, 1, 2, 3, 254, 255]);
    for (const [encode, decode] of [
      ["gzip", "gunzip"],
      ["deflate", "inflate"],
      ["deflateRaw", "inflateRaw"],
    ]) {
      for (const input of [
        source,
        new DataView(source.buffer, 1, 4),
        source.buffer,
        "hello",
      ]) {
        const compressed = z[encode + "Sync"](input);
        result.roundtrips.push(Array.from(z[decode + "Sync"](compressed)));
        const info = z[encode + "Sync"](input, { info: true });
        result.roundtrips.push({
          decoded: Array.from(z[decode + "Sync"](info.buffer)),
          written: info.engine.bytesWritten,
          closed: info.engine._closed,
        });
        let returned = false;
        const done = new Promise((resolve, reject) =>
          z[encode](input, (error, output) =>
            error
              ? reject(error)
              : resolve({
                  async: returned,
                  decoded: Array.from(z[decode + "Sync"](output)),
                }),
          ),
        );
        returned = true;
        result.roundtrips.push(await done);
      }
      for (const info of [false, true]) {
        try {
          z[decode + "Sync"](z[encode + "Sync"]("output exceeds limit"), {
            info,
            maxOutputLength: 3,
          });
          result.validation.push("unexpected success");
        } catch (error) {
          result.validation.push(failure(error));
        }
      }
      const ctor = encode[0].toUpperCase() + encode.slice(1);
      const engine = z["create" + ctor]({ chunkSize: 64 });
      const chunks = [];
      const end = new Promise((resolve, reject) => {
        engine.on("data", (chunk) => chunks.push(chunk));
        engine.on("error", reject);
        engine.on("end", resolve);
      });
      engine.write("first");
      await new Promise((resolve) => engine.flush(resolve));
      await new Promise((resolve) =>
        engine.params(1, z.constants.Z_DEFAULT_STRATEGY, resolve),
      );
      engine.end("second");
      await end;
      const compressed = new Uint8Array(
        chunks.reduce((n, c) => n + c.length, 0),
      );
      let offset = 0;
      for (const chunk of chunks) {
        compressed.set(chunk, offset);
        offset += chunk.length;
      }
      result.streams.push({
        plain: new TextDecoder().decode(z[decode + "Sync"](compressed)),
        written: engine.bytesWritten,
      });
    }
    for (const options of [
      { chunkSize: 63 },
      { chunkSize: NaN },
      { windowBits: 8 },
      { windowBits: 0 },
      { level: 10 },
      { level: null },
      { flush: 6 },
      { maxOutputLength: 0 },
      { maxOutputLength: 3 },
    ]) {
      for (const kind of ["fast", "info", "stream"]) {
        try {
          const value =
            kind === "stream"
              ? z.createGzip(options)
              : z.gzipSync("hello", { ...options, info: kind === "info" });
          value.destroy?.();
          result.validation.push(null);
        } catch (error) {
          result.validation.push(failure(error));
        }
      }
    }
    const compressed = z.deflateSync("dictionary words", {
      dictionary: new Uint8Array([1, 2, 3]),
    });
    result.dictionary = Array.from(
      z.inflateSync(compressed, {
        dictionary: new DataView(new Uint8Array([1, 2, 3]).buffer),
      }),
    );
    result.unzip = Array.from(z.unzipSync(z.gzipSync(source)));
    return result;
  },

  fsAccess: async function ({ fs }) {
    fs.writeFileSync("/tmp/access-contract", "value");
    const results = [];
    for (const path of ["/tmp/access-contract", "/tmp/access-missing"]) {
      for (let mode = 0; mode < 8; mode++) {
        let sync = null;
        try {
          fs.accessSync(path, mode);
        } catch (error) {
          sync = error.code;
        }
        let promise = null;
        try {
          await fs.promises.access(path, mode);
        } catch (error) {
          promise = error.code;
        }
        let returned = false;
        const pending = new Promise((resolve) =>
          fs.access(path, mode, (error) =>
            resolve([error?.code ?? null, returned]),
          ),
        );
        returned = true;
        results.push({ path, mode, sync, promise, callback: await pending });
      }
    }
    const invalid = [];
    for (const mode of [-1, 8, 1.5, "4"]) {
      let callbackCalled = false;
      try {
        fs.access("/tmp/access-contract", mode, () => {
          callbackCalled = true;
        });
      } catch (error) {
        invalid.push([error.name, error.code, callbackCalled]);
      }
    }
    const beforeDeletion = new Promise((resolve) =>
      fs.access("/tmp/access-contract", (error) =>
        resolve(error?.code ?? null),
      ),
    );
    fs.unlinkSync("/tmp/access-contract");
    const beforeCreation = new Promise((resolve) =>
      fs.access("/tmp/access-contract", (error) =>
        resolve(error?.code ?? null),
      ),
    );
    fs.writeFileSync("/tmp/access-contract", "created");
    return {
      results,
      invalid,
      beforeDeletion: await beforeDeletion,
      beforeCreation: await beforeCreation,
    };
  },
  x509: function ({ crypto: c }) {
    const pem =
      "-----BEGIN CERTIFICATE-----\nMIIDhDCCAmygAwIBAgIUdN1my4bhw3mAm+rrvYEZBzi4nuAwDQYJKoZIhvcNAQEL\nBQAwJjESMBAGA1UEAwwJbG9jYWxob3N0MRAwDgYDVQQKDAdXb3JrZXJzMB4XDTI2\nMTAyMjIzMTEyNVoXDTI2MTAyNDIzMTEyNVowJjESMBAGA1UEAwwJbG9jYWxob3N0\nMRAwDgYDVQQKDAdXb3JrZXJzMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKC\nAQEAmdA4QcozdOsYQJXG5oDzOJEKHIoyM1HDVXgH2ZWTL0Qm9yJJ02uV55IhW2AY\nshAs1ZROFCae5891g4ohl1H4sFDE5HYuD4BLkh9RY8QcZ7170nA1fnxNfO0K0GZs\nJyCOerlt5fLJjcEQiiyjbs8/2yukxHJraHQIZ1cO/PbWJx9O7iZ5Ru7u2ompDrsz\nzTbVgjI/u4g+sHEf+11me+7WW13Lj4FvpDHZp1K9zoMtOj/ruURVs/5wO3gygNnO\nVVrtNc/0nOU0Qqlqyr0QC9ZkHpn374hL2m0KC9BNixbLdQ+Oy4O406UhQXUGOSPg\ndfN3MBgPJrs1yZ1Io6pL41LWXwIDAQABo4GpMIGmMB0GA1UdDgQWBBSlprvE05R3\nZRC3gulykkeMzbOIZzAPBgNVHRMBAf8EBTADAQH/MFUGA1UdEQROMEyCCWxvY2Fs\naG9zdIIOKi5leGFtcGxlLnRlc3SHBH8AAAGBEXRlc3RAZXhhbXBsZS50ZXN0hhZo\ndHRwczovL2V4YW1wbGUudGVzdC9hMB0GA1UdJQQWMBQGCCsGAQUFBwMBBggrBgEF\nBQcDAjANBgkqhkiG9w0BAQsFAAOCAQEAWO4DydLOPOBNyKYw50dBT/UgF9l7zvk+\nl2C7v1dMVCtpKW4egHUjINf+tOHC7PLjMMSKDvM/NGszAePPRSAJzfvoIEF5nahz\nLAzcM3zIdp7vviP1yeSSgJH5QRvo4pMV13K4FHARR5L/ShZqEKvKbVwDCrzymkND\nV5SGa11p5xf0Fm6061vfgBQ85vNFANXByqznGhn9tBRf5pJGBl4cjTJ9WCl8zVCs\n++24wsetgXwxL9O1p+NvfM8SdTVGBSevAA/OAc2Fjoye4oJHH4n3sCsIxoEeRnb4\nZYhC9Q4UwNucHDFJASAMWC5AfX7P+HnaguZXGHsfBrw/39sZFdncwg==\n-----END CERTIFICATE-----\n";
    const privatePem =
      "-----BEGIN PRIVATE KEY-----\nMIIEugIBADANBgkqhkiG9w0BAQEFAASCBKQwggSgAgEAAoIBAQCZ0DhByjN06xhA\nlcbmgPM4kQocijIzUcNVeAfZlZMvRCb3IknTa5XnkiFbYBiyECzVlE4UJp7nz3WD\niiGXUfiwUMTkdi4PgEuSH1FjxBxnvXvScDV+fE187QrQZmwnII56uW3l8smNwRCK\nLKNuzz/bK6TEcmtodAhnVw789tYnH07uJnlG7u7aiakOuzPNNtWCMj+7iD6wcR/7\nXWZ77tZbXcuPgW+kMdmnUr3Ogy06P+u5RFWz/nA7eDKA2c5VWu01z/Sc5TRCqWrK\nvRAL1mQemffviEvabQoL0E2LFst1D47Lg7jTpSFBdQY5I+B183cwGA8muzXJnUij\nqkvjUtZfAgMBAAECgf8siPZrptQSyRG8lmJJGJoUo5EbjUEG5SHuRhshJdain2Fi\nXTQDAUbTk9qsyLx0Cc9R6i3D0LFeaXIvmqvgIprr+2vAYYKfT7S28Yb2hq6Y1WPW\nUQO5H3/zZ1IraUiG4uR0ZTEVoKP98mieEAgvlMr81UtF0V0uFwZ1kBpkjAE2nGj4\nISzH0MsafINRIYWsJ4cDGJikBY9e0DG2DhG1w4qNmJq+2cWM8+kLVII8V7u97ef1\nWGnSTa3OkmU5wlmUbS3Ju8bAoTkkJ+a49KT3OlKITdF7UKYGG2rseWgZULd5ZSek\nlcnuBAuqD7lJRBbVjI5AFr8fSQU0FzMwrvVAOpECgYEAy4ERAoBZfToz1ILH5u4K\n8N4uZmAafRlVtyPISP1KkSNDQI1gCxuuCsT03lgWOrXKE8gtqICSryMygycBSGni\n3+QUQU61+QnTuslIwTfIZUQG6zTdwEpAmLVJ3KsaaS4rpn3fpq+umPLmZ59h9eJp\nuevxhFv/muWjzRsxxTPsMfECgYEAwX2woht7j6NF9ilSrtSGoESPwCNci431mKJd\no3MOKtjtedYWfycJKUQ+B+do0xd7Y43dTrLcH52ZpvDMsyYg3bP9uWKnvqc4cm8q\ndn4AyYx0W1P4jf8iyLm6yEqif6J6UuLyyoMjsO3b8FBqAHRNdGFIg6f183MYcu4b\ndwUZPU8CgYA68hSiO9kv+7bdnFAY5OSIZmLcRoQFrlv0o0m1UqDRr3wga5LhRNBB\n0FD5QlyV/ugcmMQY5b0XO8O614Z4miscHO19CTaOfzk0Bm+rf+Ps6Spz4KlGtHtH\ngGN3ppwM0VHVdOpeVs7lAJ6ab0Epvr5PGzem1hsQm+m5VGIzM9n7kQKBgFYqY/t8\n46SOoDxEILcMm7tJbP6ygKcBG+rR+4MrXJbGLdMA/Nm5B4JiCoG4ktzWazNlXLWM\nPyyxIVjPiUkKZL52RjpFbdAgZanISY+lAzK+Ip79IQYTJWlgFIbXfc/7CiBZQqfe\niIllE3nMRbhYEpoOLJ28sXGtwqiD0qVJFvlPAoGAaf740rwvulTjEuaMfyaUf95/\n7fiRyD39Ct9GqDLvOiJAyWrVLaRYdV8warqWwwu0KHczAVs+eWe4WhTV7jZvPBLg\nLJcIZuJytVWIYFfSkHgdxk6sFYKCvETi6zgYBREnYkFPYzMdiOX57c2Di8SzAt/T\nUV3iEhCZhSw7+VFVgu8=\n-----END PRIVATE KEY-----\n";
    const cert = new c.X509Certificate(pem),
      key = c.createPrivateKey(privatePem);
    const attempt = (fn) => {
      try {
        return fn() ?? null;
      } catch (error) {
        return { name: error.name, code: error.code, message: error.message };
      }
    };
    const fields = [
      "subject",
      "issuer",
      "subjectAltName",
      "infoAccess",
      "validFrom",
      "validTo",
      "fingerprint",
      "fingerprint256",
      "fingerprint512",
      "keyUsage",
      "serialNumber",
      "ca",
      "issuerCertificate",
    ];
    const padded = new Uint8Array(cert.raw.length + 4);
    padded.set(cert.raw, 2);
    return {
      fields: Object.fromEntries(fields.map((k) => [k, cert[k] ?? null])),
      raw: Array.from(cert.raw),
      pem: cert.toString(),
      json: cert.toJSON(),
      legacy: cert.toLegacyObject(),
      cached:
        cert.raw === cert.raw &&
        cert.publicKey === cert.publicKey &&
        cert.toLegacyObject() === cert.toLegacyObject(),
      publicKey: cert.publicKey.export({ format: "pem", type: "spki" }),
      der: new c.X509Certificate(
        new DataView(padded.buffer, 2, cert.raw.length),
      ).fingerprint,
      issued: cert.checkIssued(cert),
      private: cert.checkPrivateKey(key),
      verified: cert.verify(cert.publicKey),
      wrongKey: cert.checkPrivateKey(
        c.generateKeyPairSync("rsa", { modulusLength: 1024 }).privateKey,
      ),
      hosts: [
        "localhost",
        "x.example.test",
        "x.y.example.test",
        "wrong.invalid",
        "localhost\0wrong",
      ].map((n) => attempt(() => cert.checkHost(n))),
      options: [
        { wildcards: false },
        { partialWildcards: false },
        { multiLabelWildcards: true },
        { subject: "never" },
        { subject: "invalid" },
        { wildcards: 0 },
        false,
      ].map((o) => attempt(() => cert.checkHost("x.y.example.test", o))),
      emails: ["test@example.test", "other@example.test"].map((n) =>
        attempt(() => cert.checkEmail(n)),
      ),
      ips: ["127.0.0.1", "127.0.0.2", "::1", "not-ip"].map((n) =>
        attempt(() => cert.checkIP(n)),
      ),
      invalid: [
        () => new c.X509Certificate("bad"),
        () => new c.X509Certificate(new ArrayBuffer(4)),
        () => cert.checkIssued({}),
        () => cert.checkPrivateKey(cert.publicKey),
        () => cert.verify(key),
        () => cert.checkHost(1),
      ].map(attempt),
    };
  },

  x509Ec: function ({ crypto: c }) {
    const pem =
        "-----BEGIN CERTIFICATE-----\nMIIBaDCCAQ6gAwIBAgIUR0JYwBRWD1OQflPk9iq6c8s/90swCgYIKoZIzj0EAwIw\nGjEYMBYGA1UEAwwPZWMuZXhhbXBsZS50ZXN0MB4XDTI2MTAyMzAwNTEyN1oXDTI2\nMTAyNTAwNTEyN1owGjEYMBYGA1UEAwwPZWMuZXhhbXBsZS50ZXN0MFkwEwYHKoZI\nzj0CAQYIKoZIzj0DAQcDQgAE91VvPzxvJu7z28yu3162tL9f1pYoEAEsCbb0dYdG\nUGcUv3zuHz7fhcfqvuzuDnV2Jh8Y8qp+MtGlWxh8fOhYzKMyMDAwHQYDVR0OBBYE\nFAaHxuLK5SXnLdzXW7X0SclrQrvvMA8GA1UdEwEB/wQFMAMBAf8wCgYIKoZIzj0E\nAwIDSAAwRQIhAOZXfipKh5gsRprMHc/SO3TcjNqBBUSKHwOxr2nqpa1UAiB3ZSBJ\nuNDgK4eNIasqXlmgXmC8M3MD7LdTk0qwUc+fPQ==\n-----END CERTIFICATE-----\n",
      keyPem =
        "-----BEGIN PRIVATE KEY-----\nMIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg3MCUdaaqmJh19iLT\ny72VTuXH0U44yXi/D5VN89PXA6WhRANCAAT3VW8/PG8m7vPbzK7fXra0v1/WligQ\nASwJtvR1h0ZQZxS/fO4fPt+Fx+q+7O4OdXYmHxjyqn4y0aVbGHx86FjM\n-----END PRIVATE KEY-----\n";
    const cert = new c.X509Certificate(pem),
      raw = new Uint8Array(cert.raw);
    raw[raw.length - 1] ^= 1;
    const damaged = new c.X509Certificate(raw);
    const key = c.createPrivateKey(keyPem);
    return {
      legacy: cert.toLegacyObject(),
      publicKey: cert.publicKey.export({ format: "pem", type: "spki" }),
      usage: cert.keyUsage ?? null,
      subject: cert.subject,
      issued: cert.checkIssued(cert),
      private: cert.checkPrivateKey(key),
      verified: cert.verify(cert.publicKey),
      imported: cert.verify(c.createPublicKey(key)),
      damaged: damaged.verify(cert.publicKey),
      cached: cert.toLegacyObject() === cert.toLegacyObject(),
    };
  },
  x509Names: function ({ crypto: c }) {
    const cert = new c.X509Certificate(
      "-----BEGIN CERTIFICATE-----\nMIICdjCCAhygAwIBAgIUQsn9ZMGrGViSPljhZDsSPq54huQwCgYIKoZIzj0EAwIw\nODEbMBkGA1UEAwwSY2Fmw6kuZXhhbXBsZS50ZXN0MRkwFwYDVQQKDBBXb3JrZXJz\nICsgTmF0aXZlMB4XDTI2MTAyMzAxMDEzOVoXDTI2MTAyNTAxMDEzOVowODEbMBkG\nA1UEAwwSY2Fmw6kuZXhhbXBsZS50ZXN0MRkwFwYDVQQKDBBXb3JrZXJzICsgTmF0\naXZlMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEBT9EJkWZClxIzvyp7SNufuJF\nEAYD8CzONWw47BsuaZCJElS8JEbVTNC5aWNy45S7IIRj6d4PS/GU6DT1M1sLoaOC\nAQIwgf8wCQYDVR0TBAIwADCBsQYDVR0RBIGpMIGmghJ2YWxpZC5leGFtcGxlLnRl\nc3SCF2NvbW1hLG5hbWUuZXhhbXBsZS50ZXN0hhhodHRwczovL2V4YW1wbGUudGVz\ndC9hLGKHECABDbgAAAAAAAAAAAAAAAGBEXRlc3RAZXhhbXBsZS50ZXN0oCEGCisG\nAQQBgjcUAgOgEwwRdXNlckBleGFtcGxlLnRlc3SkFTATMREwDwYDVQQDDAhEaXIs\nTmFtZTA+BggrBgEFBQcBAQQyMDAwLgYIKwYBBQUHMAGGImh0dHBzOi8vb2NzcC5l\neGFtcGxlLnRlc3QvdmFsaWRhdGUwCgYIKoZIzj0EAwIDSAAwRQIgfppXDfKn85vj\nDm1QS9agAk9W5P8Md841oJ+8nVaAg4ECIQDeXmgVDWiRqusAivE68OEKJB5arucO\nyLzk3hNzHXSQKg==\n-----END CERTIFICATE-----\n",
    );
    const raw = new Uint8Array(cert.raw),
      marker = new TextEncoder().encode("Workers + Native");
    for (let i = 0; i <= raw.length - marker.length; i++)
      if (marker.every((byte, j) => raw[i + j] === byte)) raw[i] = 0;
    const nulNames = new c.X509Certificate(raw).toLegacyObject();
    const attempt = (fn) => {
      try {
        return fn() ?? null;
      } catch (e) {
        return { name: e.name, message: e.message, code: e.code };
      }
    };
    return {
      nulNames,
      subject: cert.subject,
      san: cert.subjectAltName,
      info: cert.infoAccess,
      ca: cert.ca,
      legacy: cert.toLegacyObject(),
      ip: cert.checkIP("2001:db8::1"),
      names: [{}, { subject: "always" }, { subject: "never" }].map((o) =>
        attempt(() => cert.checkHost("café.example.test", o)),
      ),
      invalid: [
        () => cert.checkEmail("a\0b"),
        () => cert.checkIP("127.0.0.1\0evil"),
        () => cert.checkHost("valid.example.test", { partialWildcards: 1 }),
        () =>
          cert.checkHost("valid.example.test", { singleLabelSubdomains: 1 }),
      ].map(attempt),
    };
  },
  certificates: function ({ crypto: c }) {
    const signatures = [
      "MIIBVDCBvjCBnzANBgkqhkiG9w0BAQEFAAOBjQAwgYkCgYEAzEBFZlRokWwqjZlV3uIZCb4XHlCRHi11xrIKzd3+zjmeqJdb3UMkZCQH52zU7DO+mfYwD1+pB9QHh0NsLlkUqkc+Ko5k2KHs0EuWL4NoOMf++wiRD39b2XpEyBdI7NYlsfZHhrXihsyVZsNrfXlWv6+gqGvFjh4nXEzZ2+kxfvECAwEAARYacG9ydGFibGUtd29ya2Vycy1jaGFsbGVuZ2UwDQYJKoZIhvcNAQEEBQADgYEAdBV72QBrvJdRpeG7kVjGpPlW8BRVVBO7arGOQjYs6q7W03dkMPj4uzVyGYZLj59eScSYGA7PnyiOGwy5loRIMVPciLK3YKz74auiRz+XUHFJysOK28Y6QPuRr48CRFu8H7e081ZOHkeyhcwRhd7wjEI4ngHoJ3dhqMy0syA5Vi0=",
      "MIIBVDCBvjCBnzANBgkqhkiG9w0BAQEFAAOBjQAwgYkCgYEAzEBFZlRokWwqjZlV3uIZCb4XHlCRHi11xrIKzd3+zjmeqJdb3UMkZCQH52zU7DO+mfYwD1+pB9QHh0NsLlkUqkc+Ko5k2KHs0EuWL4NoOMf++wiRD39b2XpEyBdI7NYlsfZHhrXihsyVZsNrfXlWv6+gqGvFjh4nXEzZ2+kxfvECAwEAARYacG9ydGFibGUtd29ya2Vycy1jaGFsbGVuZ2UwDQYJKoZIhvcNAQELBQADgYEAyzRKqH1NI8+WT1sXzMIDzxnPl+GiD9aEsGjRPMZek+NYOxb63DpXBaZ4PcAc7no1nymhoysWxibrj/gJjG2hOUTRkzNamyF4vdRij5FsAtyWMUaV0uDZFkuasiL3R/Q/oh5XEP+uWqlysfeGG+z/JKoWU5nL/Ac2kT4evqx5pMU=",
    ];
    const api = c.Certificate;
    const instance = new api(),
      called = api();
    const describe = (value) => ({
      verified: api.verifySpkac(value),
      publicKey: api.exportPublicKey(value).toString("utf8"),
      challenge: api.exportChallenge(value).toString("hex"),
    });
    const cases = signatures.flatMap((value) => {
      const data = new TextEncoder().encode(value),
        padded = new Uint8Array(data.length + 4);
      padded.set(data, 2);
      const view = new DataView(padded.buffer, 2, data.length);
      const damaged = value.slice(0, -8) + "AAAAAAAA";
      return [
        describe(value),
        describe(data.buffer),
        describe(view),
        describe(value + " \n\r\t"),
        describe(damaged),
        {
          hex: api
            .exportChallenge(
              Array.from(data, (b) => b.toString(16).padStart(2, "0")).join(""),
              "hex",
            )
            .toString("hex"),
          legacy: instance
            .exportPublicKey(data)
            .equals(api.exportPublicKey(data)),
          called: called
            .exportChallenge(data)
            .equals(api.exportChallenge(data)),
          bufferEncoding: api.exportChallenge(value, "buffer").toString("hex"),
        },
      ];
    });
    const invalid = ["", " \n\t", "not-base64", "SPKAC=" + signatures[0]].map(
      describe,
    );
    const errors = [];
    for (const name of ["verifySpkac", "exportPublicKey", "exportChallenge"])
      for (const value of [undefined, null, 42, {}]) {
        try {
          api[name](value);
          errors.push(null);
        } catch (e) {
          errors.push({ name: e.name, code: e.code, message: e.message });
        }
      }
    return {
      cases,
      invalid,
      errors,
      instance: instance instanceof api,
      called: called instanceof api,
      methods: ["verifySpkac", "exportPublicKey", "exportChallenge"].map(
        (n) => instance[n] === api[n],
      ),
    };
  },

  primeNumbers: async function ({ crypto }) {
    const capture = (fn) => {
      try {
        return { value: fn() ?? null };
      } catch (e) {
        return { name: e.name, code: e.code ?? null, message: e.message };
      }
    };
    const candidates = [
      0n,
      1n,
      2n,
      3n,
      4n,
      17n,
      561n,
      1105n,
      18446744073709551557n,
    ];
    const checked = candidates.map((value) => crypto.checkPrimeSync(value));
    const safe = crypto.generatePrimeSync(32, { safe: true, bigint: true });
    const constrained = crypto.generatePrimeSync(32, {
      add: 12n,
      rem: 11n,
      bigint: true,
    });
    const buffer = crypto.generatePrimeSync(32);
    const log = [];
    const async = await new Promise((resolve, reject) => {
      crypto.checkPrime(17n, (error, value) => {
        log.push("callback");
        error ? reject(error) : resolve(value);
      });
      log.push("after");
    });
    const generated = await new Promise((resolve, reject) =>
      crypto.generatePrime(16, { bigint: true }, (error, value) =>
        error ? reject(error) : resolve(crypto.checkPrimeSync(value)),
      ),
    );
    const errors = [
      () => crypto.checkPrimeSync(-1n),
      () => crypto.checkPrimeSync("17"),
      () => crypto.checkPrimeSync(17n, { checks: 65 }),
      () => crypto.checkPrimeSync(17n, { checks: -1 }),
      () => crypto.checkPrimeSync(new Uint8Array(1025)),
      () => crypto.generatePrimeSync(0),
      () => crypto.generatePrimeSync(8193),
      () => crypto.generatePrimeSync(16, { safe: 1 }),
      () => crypto.generatePrimeSync(16, { add: 4n, rem: 3n }),
      () => crypto.generatePrimeSync(2, { add: 12n, rem: 11n }),
    ].map(capture);
    return {
      checked,
      safe:
        crypto.checkPrimeSync(safe) && crypto.checkPrimeSync((safe - 1n) / 2n),
      safeBits: safe.toString(2).length,
      remainder: String(constrained % 12n),
      constrainedBits: constrained.toString(2).length,
      buffer: {
        brand: buffer instanceof ArrayBuffer,
        bytes: buffer.byteLength,
        prime: crypto.checkPrimeSync(buffer),
      },
      async,
      generated,
      log,
      errors,
    };
  },
  asymmetricKeys: async function ({ crypto }) {
    // Disposable fixture keys generated by independent Node crypto, never credentials.
    const fixtures = {
      rsa: {
        privateKey:
          "-----BEGIN PRIVATE KEY-----\nMIICdQIBADANBgkqhkiG9w0BAQEFAASCAl8wggJbAgEAAoGBAKmqearRpQ+76PnZ\nQ8r2aFHbGae4GwWqLQDF15XxwtcDUUTytnIBmpxw8I5cs9YezIh2hZc/lYcW9Gmb\nXBTOaHtDgkR+hXxq1o0awFarEJMFW80w3j+68/syK11IvRhsbcGBQvw15SGoeaHQ\nhvWSN+IiTDKQYeJ328e7yjFh3Ct5AgMBAAECgYBhwVdYlHIGHr6dNhFZX5+7igG+\nINVw7hv/1f3g5urb941brHxyM3phqLDxVXhIZnZyKdfOzVPaAd/Q+TKUylhnvJQz\nf3b2YBdtOz4AIsMPWnTilDRi1Kwu5mvcF5gzlbBsleJMTjRRDWwG1Sxg69Yze/Rh\nnZ8kJTEye7nMaZPAAQJBANo0MndLMjNLLpin925wiDmLO5Vct6GnPGY1gfNbzVXl\n6uUs4oc5XolZDjsW97bYsn+Rip52hX5rqkeNYBncOJECQQDHDfYgGx48qFmb1gRU\nd8ikvDIWk9DurQvnjGcGfWvAzvtyw9ybk0CBpFghrF7izutj+j0VfnFWlNX9e612\nNXhpAkAy1nhvjMh8ZObNUEz4oSVL6uGN8hUih5kt4weM0HWtrqykimmYwcgBzgrf\nv4ElS6WCzUDznH+Lrb/1fb3HKKTRAkAc+QBBDhFpnMtmLlF1BfZTW/0iYiOACfn4\nmuwH+strRfU9cBq1Hkq+U/Br/k3VT27dn3eyoDPY+VLoUU8fLIs5AkAl7rPmRk0W\naVESr8259cVOXJZNfff+NDbTDO88/et+bARWUPPFopAOQhbRaHzoQN05WsAnDSl0\n3R6Dwk53bF0r\n-----END PRIVATE KEY-----\n",
        publicKey:
          "-----BEGIN PUBLIC KEY-----\nMIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCpqnmq0aUPu+j52UPK9mhR2xmn\nuBsFqi0AxdeV8cLXA1FE8rZyAZqccPCOXLPWHsyIdoWXP5WHFvRpm1wUzmh7Q4JE\nfoV8ataNGsBWqxCTBVvNMN4/uvP7MitdSL0YbG3BgUL8NeUhqHmh0Ib1kjfiIkwy\nkGHid9vHu8oxYdwreQIDAQAB\n-----END PUBLIC KEY-----\n",
        jwk: {
          kty: "RSA",
          n: "qap5qtGlD7vo-dlDyvZoUdsZp7gbBaotAMXXlfHC1wNRRPK2cgGanHDwjlyz1h7MiHaFlz-Vhxb0aZtcFM5oe0OCRH6FfGrWjRrAVqsQkwVbzTDeP7rz-zIrXUi9GGxtwYFC_DXlIah5odCG9ZI34iJMMpBh4nfbx7vKMWHcK3k",
          e: "AQAB",
          d: "YcFXWJRyBh6-nTYRWV-fu4oBviDVcO4b_9X94Obq2_eNW6x8cjN6Yaiw8VV4SGZ2cinXzs1T2gHf0PkylMpYZ7yUM3929mAXbTs-ACLDD1p04pQ0YtSsLuZr3BeYM5WwbJXiTE40UQ1sBtUsYOvWM3v0YZ2fJCUxMnu5zGmTwAE",
          p: "2jQyd0syM0sumKf3bnCIOYs7lVy3oac8ZjWB81vNVeXq5SzihzleiVkOOxb3ttiyf5GKnnaFfmuqR41gGdw4kQ",
          q: "xw32IBsePKhZm9YEVHfIpLwyFpPQ7q0L54xnBn1rwM77csPcm5NAgaRYIaxe4s7rY_o9FX5xVpTV_XutdjV4aQ",
          dp: "MtZ4b4zIfGTmzVBM-KElS-rhjfIVIoeZLeMHjNB1ra6spIppmMHIAc4K37-BJUulgs1A85x_i62_9X29xyik0Q",
          dq: "HPkAQQ4RaZzLZi5RdQX2U1v9ImIjgAn5-JrsB_rLa0X1PXAatR5KvlPwa_5N1U9u3Z93sqAz2PlS6FFPHyyLOQ",
          qi: "Je6z5kZNFmlREq_NufXFTlyWTX33_jQ20wzvPP3rfmwEVlDzxaKQDkIW0Wh86EDdOVrAJw0pdN0eg8JOd2xdKw",
        },
        signature:
          "VZCB1w22hBa1DrzurqCnmUdaMXCFMWFCPmOg2IKfQGW48EsZCod4GpE07mJATLLjFVgdTppygeOUqvQK85/SD6jo3HNA270/ZANk4exXpj72lQziYslAY7wERfO9xozZwzAd2Mwg/XrUtlT4flGodizI0wCmGsOZ9ToqcSSjFKM=",
      },
      ec: {
        privateKey:
          "-----BEGIN PRIVATE KEY-----\nMIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgkzAWEEq6Qf3Q3Zj8\njZzVPzjXi9v1UE4fUvSPCYDzIQ+hRANCAATUyxPEFq8wbhMtrw73FeZ4pAGrhRIV\n33P91jSkmz3i4hqV4Q4p8i4jxCmRxXjS8pmjSzVVtV1haS6lqKB3PqTW\n-----END PRIVATE KEY-----\n",
        publicKey:
          "-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE1MsTxBavMG4TLa8O9xXmeKQBq4US\nFd9z/dY0pJs94uIaleEOKfIuI8QpkcV40vKZo0s1VbVdYWkupaigdz6k1g==\n-----END PUBLIC KEY-----\n",
        jwk: {
          kty: "EC",
          x: "1MsTxBavMG4TLa8O9xXmeKQBq4USFd9z_dY0pJs94uI",
          y: "GpXhDinyLiPEKZHFeNLymaNLNVW1XWFpLqWooHc-pNY",
          crv: "P-256",
          d: "kzAWEEq6Qf3Q3Zj8jZzVPzjXi9v1UE4fUvSPCYDzIQ8",
        },
        signature:
          "MEYCIQD6Z6h2C9Ph77WTRPSzZiegB6hwdYGLY6piOyWM8h9iAQIhALPJTymfz9UQrYqJTuwvuFk3iM0laFYjEcueJYXPX67X",
      },
      ed25519: {
        privateKey:
          "-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIOzFGVeuGidC3g/gfu6BLZHV0nkI1cOdcgJSZndBdLk5\n-----END PRIVATE KEY-----\n",
        publicKey:
          "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAZ9S/SKhncpbOeH+ppPVjBQnZl6SBN+2UCWsZPmqVc7U=\n-----END PUBLIC KEY-----\n",
        jwk: {
          crv: "Ed25519",
          d: "7MUZV64aJ0LeD-B-7oEtkdXSeQjVw51yAlJmd0F0uTk",
          x: "Z9S_SKhncpbOeH-ppPVjBQnZl6SBN-2UCWsZPmqVc7U",
          kty: "OKP",
        },
        signature:
          "2Atk1x63ifZkxT1hOgEN32mT3U4Toiy3+659GbAgKFsMZi6Z2j0ZKTk8DsnXCllDzGB0LJKxnxnQEp0I/tAcCQ==",
      },
      x25519: {
        privateKey:
          "-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VuBCIEIFgmCj/A/WL5EEgvvjyCUV0/+K/sxR62Z6WlK/Vz1ydG\n-----END PRIVATE KEY-----\n",
        publicKey:
          "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VuAyEACs62/8koQj99zkBorRDHAvE3uptEtZIjbmL6ogtsRwU=\n-----END PUBLIC KEY-----\n",
        jwk: {
          crv: "X25519",
          d: "WCYKP8D9YvkQSC--PIJRXT_4r-zFHrZnpaUr9XPXJ0Y",
          x: "Cs62_8koQj99zkBorRDHAvE3uptEtZIjbmL6ogtsRwU",
          kty: "OKP",
        },
        signature: null,
        peer: "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VuAyEA3lvtx86rEZf58Uf9X9OIEYtpWglahuEwoK3lzb9kxC0=\n-----END PUBLIC KEY-----\n",
        secret:
          "c47b7be86dc7effc5514183876c5377825417f783b1ae4b8f5edd6afcf0c4922",
      },
    };
    const decode = (value) =>
      Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
    const data = new TextEncoder().encode("Workers portable key");
    const result = {};
    for (const [type, fixture] of Object.entries(fixtures)) {
      const privateKey = crypto.createPrivateKey(fixture.privateKey);
      const publicKey = crypto.createPublicKey(privateKey);
      const imported = crypto.createPublicKey(fixture.publicKey);
      const jwk = crypto.createPrivateKey({ key: fixture.jwk, format: "jwk" });
      const der = privateKey.export({ format: "der", type: "pkcs8" });
      const roundtrip = crypto.createPrivateKey({
        key: der,
        format: "der",
        type: "pkcs8",
      });
      const details = privateKey.asymmetricKeyDetails;
      const entry = {
        type: privateKey.type,
        algorithm: privateKey.asymmetricKeyType,
        details: JSON.parse(
          JSON.stringify(details, (_, value) =>
            typeof value === "bigint" ? value.toString() : value,
          ),
        ),
        publicPem: publicKey.export({ format: "pem", type: "spki" }),
        publicEqual: publicKey.equals(imported),
        jwkEqual: privateKey.equals(jwk),
        derEqual: privateKey.equals(roundtrip),
        publicJwk: publicKey.export({ format: "jwk" }),
        privateJwk: privateKey.export({ format: "jwk" }),
      };
      entry.dhValidation = [
        {},
        { publicKey },
        { publicKey: {}, privateKey },
        { publicKey: privateKey, privateKey },
        { publicKey, privateKey: publicKey },
        { publicKey: fixture.publicKey, privateKey },
        { publicKey, privateKey: fixture.privateKey },
        {
          publicKey,
          privateKey: crypto.createPrivateKey(
            fixtures[type === "rsa" ? "ec" : "rsa"].privateKey,
          ),
        },
      ].map((options) => {
        try {
          crypto.diffieHellman(options);
          return null;
        } catch (e) {
          return { name: e.name, code: e.code ?? null };
        }
      });
      if (type === "x25519") {
        try {
          entry.secret = crypto
            .diffieHellman({
              privateKey,
              publicKey: crypto.createPublicKey(fixture.peer),
            })
            .toString("hex");
        } catch (e) {
          entry.error = { name: e.name, message: e.message };
        }
      } else {
        const algorithm = type === "ed25519" ? null : "sha256";
        const signature = crypto.sign(algorithm, data, privateKey);
        entry.verifies = crypto.verify(algorithm, data, publicKey, signature);
        entry.independent = crypto.verify(
          algorithm,
          data,
          publicKey,
          decode(fixture.signature),
        );
        entry.tampered = crypto.verify(
          algorithm,
          new Uint8Array([0]),
          publicKey,
          signature,
        );
        if (type !== "ed25519") {
          const signer = crypto.createSign("sha256");
          signer.update(data.subarray(0, 3));
          signer.update(data.subarray(3));
          const streamed = signer.sign(privateKey);
          const verifier = crypto.createVerify("sha256");
          verifier.update(data.subarray(0, 5));
          verifier.update(data.subarray(5));
          entry.streaming = {
            valid: verifier.verify(publicKey, streamed),
            independent: crypto
              .createVerify("sha256")
              .update(data)
              .verify(publicKey, decode(fixture.signature)),
            cross: crypto.verify("sha256", data, publicKey, streamed),
            constructor: signer instanceof crypto.Sign,
          };
          if (type === "rsa")
            entry.streaming.signature = streamed.toString("base64");
          const failure = (run) => {
            try {
              run();
              return null;
            } catch (error) {
              return {
                name: error.name,
                message: error.message,
                code: error.code ?? null,
              };
            }
          };
          entry.streaming.errors = [
            failure(() => signer.update(data)),
            failure(() => signer.sign(privateKey)),
            failure(() => verifier.update(data)),
            failure(() => verifier.verify(publicKey, streamed)),
            failure(() => crypto.createSign("not-a-digest")),
            failure(() => crypto.createVerify("not-a-digest")),
          ];
          const encoded = crypto
            .createSign("sha256")
            .update(data)
            .sign({
              key: fixture.privateKey,
              ...(type === "ec"
                ? { dsaEncoding: "ieee-p1363" }
                : { padding: 6, saltLength: 0 }),
            });
          entry.streaming.options = crypto
            .createVerify("sha256")
            .update(data)
            .verify(
              {
                key: fixture.publicKey,
                ...(type === "ec"
                  ? { dsaEncoding: "ieee-p1363" }
                  : { padding: 6, saltLength: 0 }),
              },
              encoded,
            );
        }
        if (type === "ec") {
          const encoded = crypto.sign("sha256", data, {
            key: fixture.privateKey,
            dsaEncoding: "ieee-p1363",
          });
          entry.p1363 = {
            length: encoded.length,
            valid: crypto.verify(
              "sha256",
              data,
              { key: fixture.publicKey, dsaEncoding: "ieee-p1363" },
              encoded,
            ),
          };
        }
        if (type === "rsa") {
          entry.rsaComposition = [false, true].map((wrapped) => {
            try {
              const pub = wrapped ? { key: publicKey } : publicKey;
              const priv = wrapped ? { key: privateKey } : privateKey;
              const encrypted = crypto.publicEncrypt(pub, data);
              const signed = crypto.privateEncrypt(priv, data);
              return [
                crypto.privateDecrypt(priv, encrypted).toString("hex"),
                crypto.publicDecrypt(pub, signed).toString("hex"),
              ];
            } catch (e) {
              return { name: e.name, code: e.code ?? null };
            }
          });
          entry.rsaOptions = [
            { oaepLabel: new Uint8Array([1]) },
            { padding: 4, oaepLabel: new Uint8Array([1]), oaepHash: "sha256" },
            { padding: 4, oaepLabel: new Uint8Array([1]), oaepHash: "sha1" },
            { oaepLabel: 42 },
          ].map((options) => {
            try {
              const encrypted = crypto.publicEncrypt(
                { key: fixture.publicKey, ...options },
                data,
              );
              const decoded = crypto.privateDecrypt(
                { key: fixture.privateKey, ...options },
                encrypted,
              );
              let mismatch;
              try {
                crypto.privateDecrypt(
                  {
                    key: fixture.privateKey,
                    ...options,
                    oaepLabel: new Uint8Array([2]),
                  },
                  encrypted,
                );
                mismatch = null;
              } catch (e) {
                mismatch = { name: e.name, message: e.message };
              }
              return { decoded: decoded.toString("hex"), mismatch };
            } catch (e) {
              return { name: e.name, code: e.code ?? null, message: e.message };
            }
          });
          const signed = crypto.sign("sha256", data, {
            key: fixture.privateKey,
            padding: 6,
            saltLength: 0,
          });
          entry.pss = crypto.verify(
            "sha256",
            data,
            { key: fixture.publicKey, padding: 6, saltLength: 0 },
            signed,
          );
          const passphrase = new Uint8Array([112, 0, 97]);
          entry.encrypted = ["pem", "der"].map((format) => {
            const encrypted = privateKey.export({
              type: "pkcs8",
              format,
              cipher: "aes-256-cbc",
              passphrase,
            });
            return crypto
              .createPrivateKey({
                key: encrypted,
                type: "pkcs8",
                format,
                passphrase,
              })
              .equals(privateKey);
          });
        }

        if (type !== "ec") entry.signature = signature.toString("base64");
        entry.async = await new Promise((resolve, reject) =>
          crypto.sign(algorithm, data, privateKey, (error, signed) =>
            error
              ? reject(error)
              : crypto.verify(
                  algorithm,
                  data,
                  publicKey,
                  signed,
                  (err, valid) => (err ? reject(err) : resolve(valid)),
                ),
          ),
        );
      }
      result[type] = entry;
    }
    result.timing = [
      crypto.timingSafeEqual(data, new Uint8Array(data)),
      crypto.timingSafeEqual(new Uint8Array([1]), new Uint8Array([2])),
    ];
    return result;
  },
  asymmetricGeneration: function ({ crypto }) {
    return ["rsa", "ec", "ed25519", "x25519"].map((type) => {
      const { privateKey, publicKey } = crypto.generateKeyPairSync(
        type,
        type === "rsa"
          ? { modulusLength: 1024 }
          : type === "ec"
            ? { namedCurve: "prime256v1" }
            : {},
      );
      const exported = privateKey.export({ format: "pem", type: "pkcs8" });
      return {
        type,
        privateType: privateKey.type,
        publicType: publicKey.type,
        equal: crypto.createPrivateKey(exported).equals(privateKey),
        publicEqual: crypto.createPublicKey(privateKey).equals(publicKey),
      };
    });
  },

  processClock: function ({ process }) {
    const now = Date.now;
    try {
      Date.now = () => 1234567;
      const invalid = [null, 12, [], [1], [1, 2, 3]].map((value) => {
        try {
          return process.hrtime(value);
        } catch (e) {
          return { name: e.name, code: e.code, message: e.message };
        }
      });
      return {
        absolute: process.hrtime(),
        bigint: String(process.hrtime.bigint()),
        delta: process.hrtime([1233, 900000000]),
        invalid,
      };
    } finally {
      Date.now = now;
    }
  },
  processStubs: function ({ process }) {
    const call = (name, args = []) => {
      try {
        return { value: process[name](...args) ?? null };
      } catch (e) {
        return {
          name: e.name,
          code: e.code ?? null,
          message: e.message,
          syscall: e.syscall ?? null,
          errno: e.errno ?? null,
        };
      }
    };
    const simple = [
      "ref",
      "unref",
      "setSourceMapsEnabled",
      "getSourceMapsSupport",
      "setUncaughtExceptionCaptureCallback",
      "hasUncaughtExceptionCaptureCallback",
      "kill",
      "binding",
      "dlopen",
      "getActiveResourcesInfo",
      "memoryUsage",
      "resourceUsage",
      "threadCpuUsage",
      "cpuUsage",
      "_linkedBinding",
      "_getActiveRequests",
      "_getActiveHandles",
      "_kill",
      "constrainedMemory",
      "availableMemory",
      "execve",
      "_fatalException",
      "_tickCallback",
      "_debugProcess",
      "_debugEnd",
      "_startProfilerIdleNotifier",
      "_stopProfilerIdleNotifier",
      "send",
      "uptime",
      "getegid",
      "getgid",
      "geteuid",
      "getuid",
      "getgroups",
    ].map((name) => [name, call(name)]);
    const permissions = [
      "setegid",
      "setgid",
      "seteuid",
      "setuid",
      "setgroups",
      "initgroups",
    ].map((name) => [
      name,
      [0, 1, "0", null, undefined].map((value) => call(name, [value])),
    ]);
    const nested = [
      "permission.has",
      "report.getReport",
      "report.writeReport",
      "finalization.register",
      "finalization.registerBeforeExit",
      "finalization.unregister",
    ].map((path) => {
      const [a, b] = path.split(".");
      try {
        return [path, { value: process[a][b]() ?? null }];
      } catch (e) {
        return [
          path,
          { name: e.name, code: e.code ?? null, message: e.message },
        ];
      }
    });
    const properties = Object.fromEntries(
      [
        "arch",
        "pid",
        "ppid",
        "exitCode",
        "channel",
        "connected",
        "debugPort",
        "noDeprecation",
        "traceDeprecation",
        "throwDeprecation",
        "sourceMapsEnabled",
        "execPath",
        "release",
        "moduleLoadList",
        "_preload_modules",
        "domain",
        "_exiting",
      ].map((name) => [name, process[name] ?? null]),
    );
    return {
      simple,
      permissions,
      nested,
      properties,
      flags: Array.from(process.allowedNodeEnvironmentFlags),
    };
  },
  tlsHelpers: function ({ tls }) {
    const capture = (fn) => {
      try {
        const result = fn();
        return result === undefined ? null : result;
      } catch (e) {
        return { name: e.name, code: e.code ?? null, message: e.message };
      }
    };
    const certificates = [
      ["api.example.com", { subjectaltname: "DNS:*.example.com" }],
      ["nested.api.example.com", { subjectaltname: "DNS:*.example.com" }],
      ["example.com", { subject: { CN: "example.com" } }],
      ["EXAMPLE.COM.", { subjectaltname: "DNS:example.com" }],
      [
        "example.com",
        { subjectaltname: "DNS:other.com", subject: { CN: "example.com" } },
      ],
      ["127.0.0.1", { subjectaltname: "IP Address:127.0.0.1" }],
      ["2001:db8::1", { subjectaltname: "IP Address:2001:0db8:0:0:0:0:0:1" }],
      ["::ffff:192.0.2.1", { subjectaltname: "IP Address:::ffff:c000:201" }],
      ["example.com", { subjectaltname: 'DNS:"bad' }],
      ["example.com", {}],
    ].map(([host, cert]) =>
      capture(() => {
        const e = tls.checkServerIdentity(host, cert);
        return e
          ? {
              name: e.name,
              code: e.code,
              message: e.message,
              reason: e.reason,
              host: e.host,
              sameCert: e.cert === cert,
            }
          : null;
      }),
    );
    const protocols = [
      ["h2", "http/1.1"],
      ["é"],
      new Uint8Array([2, 104, 50]),
      new DataView(new Uint8Array([0, 2, 104, 50, 0]).buffer, 1, 3),
      ["x".repeat(256)],
      null,
    ].map((value) =>
      capture(() => {
        const out = {};
        tls.convertALPNProtocols(value, out);
        return out.ALPNProtocols ? Array.from(out.ALPNProtocols) : null;
      }),
    );
    const unsupported = [
      tls.createServer,
      tls.Server,
      tls.getCiphers,
      tls.createSecurePair,
    ].map((fn) => capture(() => fn()));
    const validations = [
      { enableTrace: true },
      { isServer: true },
      { server: {} },
      { requestCert: true },
      { rejectUnauthorized: false },
      { ALPNProtocols: [] },
      { SNICallback: () => {} },
      { requestOCSP: true },
      { secureContext: {} },
      { pskCallback: () => {} },
      { checkServerIdentity: 123 },
      { checkServerIdentity: () => {} },
    ].map((opts) =>
      capture(() => {
        const socket = new tls.TLSSocket(undefined, opts);
        socket.destroy();
        return null;
      }),
    );
    const ctx = tls.createSecureContext();
    return {
      certificates,
      protocols,
      unsupported,
      validations,
      context: ctx instanceof tls.SecureContext,
      contextValue: ctx.context ?? null,
      constants: [
        tls.CLIENT_RENEG_LIMIT,
        tls.CLIENT_RENEG_WINDOW,
        tls.DEFAULT_CIPHERS,
        tls.DEFAULT_ECDH_CURVE,
        tls.DEFAULT_MIN_VERSION,
        tls.DEFAULT_MAX_VERSION,
        tls.rootCertificates,
      ],
    };
  },
  aliases: function ({ sys, util, types }) {
    return {
      same: sys.default === util.default,
      format: sys.format("%s:%d", "value", 3),
      typesSame: types.default === util.types,
      predicates: [
        types.isMap(new Map()),
        types.isMap({}),
        types.isUint8Array(new Uint8Array()),
        types.isDataView(new DataView(new ArrayBuffer(1))),
        types.isDate(new Date(0)),
        types.isBoxedPrimitive(Object(1n)),
        types.isArrayBufferView(new Uint16Array()),
        types.isArrayBuffer(new ArrayBuffer(1)),
      ],
    };
  },
  consoleStubs: function ({ console: api }) {
    const errors = [];
    for (const name of ["Console", "context", "createTask"]) {
      try {
        api[name]();
        errors.push(null);
      } catch (e) {
        errors.push({ name: e.name, code: e.code, message: e.message });
      }
    }
    return {
      errors,
      defaultIdentity: api.default === globalThis.console,
      prototypes: [
        "log",
        "warn",
        "error",
        "table",
        "context",
        "createTask",
      ].map((n) => api.Console.prototype[n] === api[n]),
    };
  },
  cryptoMetadata: function ({ crypto: c }) {
    const errors = {};
    for (const name of ["setEngine", "setFips"]) {
      try {
        c[name]();
      } catch (error) {
        errors[name] = {
          name: error.name,
          code: error.code,
          message: error.message,
        };
      }
    }
    const curves = c.getCurves();
    const exchanges = curves.map((curve) => {
      const alice = c.createECDH(curve),
        bob = c.createECDH(curve);
      alice.setPrivateKey(
        c.createHash("sha256").update("fixture alice").digest().subarray(0, 16),
      );
      bob.setPrivateKey(
        c.createHash("sha256").update("fixture bob").digest().subarray(0, 16),
      );
      const a = alice.getPublicKey(),
        b = bob.getPublicKey();
      const left = alice.computeSecret(b),
        right = bob.computeSecret(a);
      const converted = ["compressed", "uncompressed", "hybrid"].map(
        (format) => {
          try {
            const encoded = c.ECDH.convertKey(
              a,
              curve,
              undefined,
              undefined,
              format,
            );
            return [
              encoded.toString("hex"),
              bob.computeSecret(encoded).equals(right),
            ];
          } catch (e) {
            return { name: e.name, message: e.message };
          }
        },
      );
      const copy = new c.ECDH(curve);
      const privateBytes = alice.getPrivateKey();
      const setResult = copy.setPrivateKey(
        new DataView(
          privateBytes.buffer,
          privateBytes.byteOffset,
          privateBytes.byteLength,
        ),
      );
      const generated = c.ECDH(curve);
      generated.generateKeys();
      const failures = [];
      for (const run of [
        () => new c.ECDH("not-a-curve"),
        () => new c.ECDH(curve).getPrivateKey(),
        () => new c.ECDH(curve).getPublicKey(),
        () => new c.ECDH(curve).computeSecret(a),
        () => copy.setPrivateKey(new Uint8Array([0])),
        () => copy.computeSecret(new Uint8Array([1])),
        () => c.ECDH.convertKey(new Uint8Array([1]), curve),
      ]) {
        try {
          run();
          failures.push(null);
        } catch (e) {
          failures.push({ name: e.name, message: e.message });
        }
      }
      return {
        curve,
        converted,
        failures,
        instance: copy instanceof c.ECDH,
        setReturnsUndefined: setResult === undefined,
        copied: copy.getPublicKey().equals(a),
        generated: generated
          .computeSecret(a)
          .equals(alice.computeSecret(generated.getPublicKey())),
        empty: c.ECDH.convertKey(new Uint8Array(), "not-a-curve").length,
        bytes: left.length,
        equal: left.equals(right),
        secret: left.toString("hex"),
        publicKey: a.toString("hex"),
      };
    });
    return { curves, exchanges, heap: c.secureHeapUsed(), errors };
  },
  secretKeys: async function ({ crypto: c, types }) {
    const input = new Uint8Array([1, 2, 3, 4]);
    const key = c.createSecretKey(input);
    input.fill(0);
    const raw = key.export();
    raw.fill(0);
    const options = {};
    key.export(options);
    const hmac = c.createHmac("sha256", key).update("fixture").digest("hex");
    const brands = [];
    const streamResults = [];
    const cipherKey = c.createSecretKey(
      c.createHash("sha256").update("cipher key").digest(),
    );
    const iv = c.createHash("sha256").update("iv").digest().subarray(0, 16);
    const cipher = c.createCipheriv("aes-256-cbc", cipherKey, iv);
    for (const value of [
      new c.Hmac("sha256", key),
      c.createHmac("md5", key),
      c.createCipheriv("aes-256-cbc", cipherKey, iv),
      new c.Decipheriv("aes-256-cbc", cipherKey, iv),
    ]) {
      const Class = value.constructor;
      brands.push([
        Class.name,
        Object.getPrototypeOf(value) === Class.prototype,
        value instanceof c.Hmac,
        value instanceof c.Cipheriv,
        value instanceof c.Decipheriv,
      ]);
    }
    for (const algorithm of ["sha256", "sha384", "sha512"]) {
      const instance = c.createHmac(algorithm, key);
      streamResults.push(
        await new Promise((resolve, reject) => {
          instance.on("data", (data) => resolve(data.toString("hex")));
          instance.on("error", reject);
          instance.write("fix");
          instance.end("ture");
        }),
      );
    }
    const streamCipher = c.createCipheriv("aes-256-cbc", cipherKey, iv);
    const streamDecipher = c.createDecipheriv("aes-256-cbc", cipherKey, iv);
    const streamed = new Promise((resolve, reject) => {
      let text = "";
      streamDecipher.setEncoding("utf8");
      streamDecipher.on("data", (chunk) => {
        text += chunk;
      });
      streamDecipher.on("end", () => resolve(text));
      streamDecipher.on("error", reject);
      streamCipher.on("error", reject);
      streamCipher.pipe(streamDecipher);
    });
    streamCipher.write("mes");
    streamCipher.end("sage");
    const encrypted =
      cipher.update("message", "utf8", "hex") + cipher.final("hex");
    const generated = await new Promise((resolve, reject) =>
      c.generateKey("hmac", { length: 9 }, (error, value) =>
        error ? reject(error) : resolve(value.symmetricKeySize),
      ),
    );
    const constructors = [];
    for (const Class of [
      c.KeyObject,
      c.SecretKeyObject,
      c.PublicKeyObject,
      c.PrivateKeyObject,
    ]) {
      try {
        new Class();
        constructors.push(null);
      } catch (e) {
        constructors.push({ name: e.name, message: e.message });
      }
    }
    return {
      type: key.type,
      size: key.symmetricKeySize,
      constructor: key.constructor.name,
      tag: Object.prototype.toString.call(key),
      export: key.export().toString("hex"),
      jwk: key.export({ format: "jwk" }),
      equal: key.equals(c.createSecretKey(new Uint8Array([1, 2, 3, 4]))),
      unequal: key.equals(c.createSecretKey("different")),
      branded: types.isKeyObject(key),
      fake: types.isKeyObject({}),
      options,
      hmac,
      encodedHmac: c
        .createHmac("sha256", "aa", { encoding: "hex" })
        .update("message")
        .digest("hex"),
      brands,
      streamResults,
      streamed: await streamed,
      encrypted,
      generated,
      aes: c.generateKeySync("aes", { length: 192 }).symmetricKeySize,
      constructors,
    };
  },

  cryptoRandom: async function ({ crypto: c }) {
    const values = Array.from({ length: 200 }, () => c.randomInt(-3, 9));
    const asynchronous = await new Promise((resolve, reject) =>
      c.randomInt(1, (err, n) => (err ? reject(err) : resolve(n))),
    );
    const errors = [];
    for (const args of [[0], [3, 3], [1.5], ["x"], [0, 2 ** 48]]) {
      try {
        c.randomInt(...args);
        errors.push(null);
      } catch (e) {
        errors.push({ name: e.name, code: e.code });
      }
    }
    return {
      range: values.every((n) => Number.isInteger(n) && n >= -3 && n < 9),
      asynchronous,
      uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
        c.randomUUID(),
      ),
      webcrypto: c.webcrypto === globalThis.crypto,
      subtle: c.subtle === globalThis.crypto.subtle,
      errors,
    };
  },
  cryptoHashKdf: async function ({ crypto: c }) {
    const hex = (value) =>
      Array.from(new Uint8Array(value))
        .map((n) => n.toString(16).padStart(2, "0"))
        .join("");
    const result = {
      hash: c.hash("sha256", "abc"),
      bytes: hex(c.hash("sha256", new Uint8Array([97, 98, 99]), "buffer")),
      hkdf: hex(c.hkdfSync("sha256", "key", "salt", "info", 42)),
      empty: hex(c.hkdfSync("sha256", "", "", "", 0)),
    };
    result.hkdfAsync = await new Promise((resolve, reject) =>
      c.hkdf("sha256", "key", "salt", "info", 42, (e, b) =>
        e ? reject(e) : resolve(hex(b)),
      ),
    );
    result.scrypt = hex(
      c.scryptSync("password", "salt", 32, { N: 16, r: 1, p: 1 }),
    );
    result.scryptAsync = await new Promise((resolve, reject) =>
      c.scrypt(
        "password",
        "salt",
        32,
        { cost: 16, blockSize: 1, parallelization: 1 },
        (e, b) => (e ? reject(e) : resolve(hex(b))),
      ),
    );
    return result;
  },
  cryptoInvalid: function ({ crypto: c }) {
    const errors = [];
    const calls = [
      () => c.hash(3, "x"),
      () => c.hash("sha256", null),
      () => c.hkdfSync("sha256", "a", "b", "c", -1),
      () => c.hkdfSync("sha256", "a", "b", new Uint8Array(1025), 1),
      () => c.scryptSync("a", "b", 16, { N: 3 }),
      () => c.scryptSync("a", "b", 16, { N: 16, cost: 16 }),
      () => c.scryptSync("a", "b", 16, { N: 16, r: 1, maxmem: 1 }),
      () => c.randomUUID({ disableEntropyCache: 1 }),
    ];
    for (const call of calls) {
      try {
        call();
        errors.push(null);
      } catch (e) {
        errors.push({ name: e.name, code: e.code });
      }
    }
    return errors;
  },

  fsWrites: function ({ fs }) {
    const dir = "/tmp/cf-writes";
    fs.mkdirSync(dir, { recursive: true });
    try {
      const wrote = fs.writeFileSync(dir + "/a", "hello");
      const appended = fs.appendFileSync(dir + "/a", " world");
      const fd = fs.openSync(dir + "/a", "r+");
      const bytes = new Uint8Array(5);
      const read = fs.readSync(fd, bytes, 0, 5, 0);
      const written = fs.writeSync(fd, new Uint8Array([72]), 0, 1, 0);
      fs.ftruncateSync(fd, 5);
      const size = fs.fstatSync(fd).size;
      fs.closeSync(fd);
      return {
        wrote,
        appended,
        read,
        written,
        size,
        data: fs.readFileSync(dir + "/a", "utf8"),
        bytes: Array.from(bytes),
      };
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
  fsDirectories: function ({ fs }) {
    const dir = "/tmp/cf-directories";
    fs.mkdirSync(dir, { recursive: true });
    try {
      fs.writeFileSync(dir + "/source", "value");
      fs.copyFileSync(dir + "/source", dir + "/copy");
      fs.renameSync(dir + "/copy", dir + "/renamed");
      fs.symlinkSync(dir + "/source", dir + "/link");
      return {
        entries: fs.readdirSync(dir).sort(),
        link: fs.lstatSync(dir + "/link").isSymbolicLink(),
        target: fs.readlinkSync(dir + "/link"),
        resolved: fs.realpathSync(dir + "/link"),
        data: fs.readFileSync(dir + "/link", "utf8"),
        size: fs.statSync(dir + "/renamed").size,
      };
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
  fsPromises: async function ({ fs }) {
    const p = fs.promises,
      dir = "/tmp/cf-promises";
    await p.mkdir(dir, { recursive: true });
    try {
      const handle = await p.open(dir + "/file", "w+");
      try {
        await handle.writeFile("abc");
        const buffer = new Uint8Array(3);
        const read = await handle.read(buffer, 0, 3, 0);
        return {
          read: read.bytesRead,
          buffer: Array.from(buffer),
          size: (await handle.stat()).size,
        };
      } finally {
        await handle.close();
      }
    } finally {
      await p.rm(dir, { recursive: true, force: true });
    }
  },
  fsCallbacks: async function ({ fs }) {
    const dir = "/tmp/cf-callbacks";
    fs.mkdirSync(dir, { recursive: true });
    try {
      await new Promise((resolve, reject) =>
        fs.writeFile(dir + "/file", "abc", (error) =>
          error ? reject(error) : resolve(),
        ),
      );
      const data = await new Promise((resolve, reject) =>
        fs.readFile(dir + "/file", "utf8", (error, data) =>
          error ? reject(error) : resolve(data),
        ),
      );
      const errors = [];
      for (const fn of [
        () => fs.watch(dir),
        () => fs.watchFile(dir),
        () => fs.unwatchFile(dir),
        () => fs.readFileSync(dir + "/missing"),
      ]) {
        try {
          fn();
          errors.push(null);
        } catch (e) {
          errors.push(e.code);
        }
      }
      return { data, errors };
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
  brotli: async function ({ zlib: z }) {
    const text = "hello world hello world hello world";
    const input = new TextEncoder().encode(text);
    const compressed = z.brotliCompressSync(input, {
      params: { [z.constants.BROTLI_PARAM_QUALITY]: 4 },
    });
    const decoded = new TextDecoder().decode(
      z.brotliDecompressSync(compressed),
    );
    const asyncDecoded = await new Promise((resolve, reject) =>
      z.brotliDecompress(compressed, (e, b) =>
        e ? reject(e) : resolve(new TextDecoder().decode(b)),
      ),
    );
    const stream = z.createBrotliCompress({
      params: { [z.constants.BROTLI_PARAM_QUALITY]: 4 },
    });
    const parts = [];
    const done = new Promise((resolve, reject) => {
      stream.on("data", (b) => parts.push(b));
      stream.on("error", reject);
      stream.on("end", resolve);
    });
    stream.write(input.subarray(0, 4));
    stream.end(input.subarray(4));
    await done;
    const joined = new Uint8Array(parts.reduce((n, b) => n + b.length, 0));
    let offset = 0;
    for (const b of parts) {
      joined.set(b, offset);
      offset += b.length;
    }
    return {
      decoded,
      asyncDecoded,
      stream: new TextDecoder().decode(z.brotliDecompressSync(joined)),
      crc: z.crc32("hello"),
      incremental: z.crc32("lo", z.crc32("hel")),
    };
  },

  brotliErrors: function ({ zlib: z }) {
    const outcomes = [];
    const compressed = z.brotliCompressSync(new Uint8Array(100));
    for (const run of [
      () => z.brotliDecompressSync(new Uint8Array()),
      () => z.brotliDecompressSync(new Uint8Array([255, 255, 255])),
      () => z.brotliDecompressSync(compressed, { maxOutputLength: 10 }),
    ]) {
      try {
        run();
        outcomes.push("success");
      } catch (error) {
        outcomes.push({
          name: error.name,
          message: error.message,
          code: error.code,
        });
      }
    }
    return outcomes;
  },

  codecProfiles: async function ({ zlib: z }) {
    const input = new TextEncoder().encode("streaming fixture ".repeat(2000));
    const result = {};
    for (const name of ["brotli", "zstd"]) {
      const prefix = name === "brotli" ? "Brotli" : "Zstd";
      const options = {
        chunkSize: 256,
        params: name === "brotli" ? { 0: 1, 1: 4, 2: 20 } : { 100: 5, 201: 1 },
      };
      const compressed = z[name + "CompressSync"](input, options);
      const decoded = z[name + "DecompressSync"](compressed);
      const info = z[name + "CompressSync"](input, { ...options, info: true });
      const stream = z["create" + prefix + "Compress"](options);
      stream.reset();
      const parts = [];
      stream.on("data", (chunk) => parts.push(chunk));
      const done = new Promise((resolve, reject) => {
        stream.on("end", resolve);
        stream.on("error", reject);
      });
      stream.write(input.subarray(0, 17000));
      await new Promise((resolve, reject) => {
        stream.once("error", reject);
        stream.flush(resolve);
      });
      const flushed = parts.length > 0;
      stream.end(input.subarray(17000));
      await done;
      const joined = new Uint8Array(parts.reduce((n, b) => n + b.length, 0));
      let offset = 0;
      for (const part of parts) {
        joined.set(part, offset);
        offset += part.length;
      }
      const decoder = z["create" + prefix + "Decompress"]({ chunkSize: 128 });
      let decodedLength = 0,
        decodedCrc = 0;
      decoder.on("data", (b) => {
        decodedLength += b.length;
        decodedCrc = z.crc32(b, decodedCrc);
      });
      const decoderDone = new Promise((resolve, reject) => {
        decoder.on("end", resolve);
        decoder.on("error", reject);
      });
      for (let i = 0; i < joined.length; i += 7)
        decoder.write(joined.subarray(i, i + 7));
      decoder.end();
      await decoderDone;
      result[name] = {
        length: decoded.length,
        crc: z.crc32(decoded),
        flushed,
        decodedLength,
        decodedCrc,
        bytesWritten: stream.bytesWritten,
        info: {
          type: info.engine.constructor.name,
          bytesWritten: info.engine.bytesWritten,
          roundTrip: z[name + "DecompressSync"](info.buffer).length,
        },
      };
    }
    return result;
  },

  codecErrors: function ({ zlib: z }) {
    const out = {};
    for (const name of ["Brotli", "Zstd"]) {
      const values = [];
      for (const options of [
        { chunkSize: 1 },
        { params: { 999: 1 } },
        { params: { 1: "bad" } },
        { flush: 99 },
        { finishFlush: -1 },
        { maxOutputLength: 0 },
      ]) {
        try {
          const engine = new z[name + "Compress"](options);
          engine.destroy();
          values.push(null);
        } catch (error) {
          values.push({
            name: error.name,
            code: error.code,
            message: error.message,
          });
        }
      }
      out[name] = values;
    }
    return out;
  },

  fsMetadata: async function ({ fs }) {
    const path = "/tmp/metadata";
    fs.writeFileSync(path, "data", { mode: 0o600 });
    const before = fs.statSync(path);
    fs.chmodSync(path, 0);
    await fs.promises.chown(path, 123, 456);
    const handle = await fs.promises.open(path, "r+");
    await handle.chmod(0);
    await handle.chown(123, 456);
    const after = await handle.stat();
    await handle.close();
    fs.mkdirSync("/tmp/metadata-dir", { mode: 0o700 });
    const mode = fs.statSync("/tmp/metadata-dir").mode;
    fs.rmSync(path);
    fs.rmdirSync("/tmp/metadata-dir");
    return {
      before: [before.mode, before.uid, before.gid],
      after: [after.mode, after.uid, after.gid],
      directoryMode: mode,
      statfs: fs.statfsSync("/missing"),
      bigint: Object.values(
        await fs.promises.statfs("/missing", { bigint: true }),
      ).map(String),
    };
  },

  streamCancellation: async function ({
    streams: { ReadableStream, WritableStream },
  }) {
    const tee = [];
    for (const bytes of [false, true])
      for (const reverse of [false, true]) {
        let reason;
        const source = new ReadableStream({
          ...(bytes ? { type: "bytes" } : {}),
          cancel(value) {
            reason = value;
          },
        });
        const pair = source.tee();
        const first = reverse ? 1 : 0,
          second = 1 - first;
        const a = pair[first].getReader().cancel("first");
        const b = pair[second].cancel("last");
        await Promise.all([a, b]);
        tee.push(reason);
      }
    const pipes = [];
    for (const options of [
      {},
      { preventCancel: true },
      { preventAbort: true },
      { preventCancel: true, preventAbort: true },
    ]) {
      const events = [];
      let controller,
        settled = false;
      const source = new ReadableStream({
        start(c) {
          controller = c;
        },
        cancel(reason) {
          events.push(["cancel", reason]);
        },
      });
      const sink = new WritableStream({
        write(value) {
          events.push(["write", value]);
        },
        abort(reason) {
          events.push(["abort", reason]);
        },
      });
      const signal = new AbortController();
      const done = source
        .pipeTo(sink, { ...options, signal: signal.signal })
        .then(
          () => {
            settled = true;
          },
          (reason) => {
            settled = true;
            events.push(["reject", reason]);
          },
        );
      signal.abort("stop");
      await new Promise((resolve) => setTimeout(resolve, 10));
      const before = { settled, events: events.slice() };
      controller.enqueue(1);
      await done;
      pipes.push({
        before,
        events,
        sourceLocked: source.locked,
        sinkLocked: sink.locked,
      });
    }
    return { tee, pipes };
  },

  moduleMetadata: function ({ module: m }) {
    const errors = {};
    for (const name of [
      "register",
      "registerHooks",
      "runMain",
      "syncBuiltinESMExports",
      "wrap",
      "_debug",
      "_findPath",
      "_initPaths",
      "_load",
      "_resolveFilename",
      "_resolveLookupPaths",
      "_nodeModulePaths",
      "findSourceMap",
      "findPackageJSON",
      "setSourceMapsSupport",
      "stripTypeScriptTypes",
      "SourceMap",
    ]) {
      try {
        m[name]();
        errors[name] = null;
      } catch (e) {
        errors[name] = { name: e.name, code: e.code, message: e.message };
      }
    }
    return {
      errors,
      compile: m.enableCompileCache() === undefined,
      dir: m.getCompileCacheDir() === undefined,
      flush: m.flushCompileCache() === undefined,
      maps: m.getSourceMapsSupport(),
      builtin: [
        "crypto",
        "node:crypto",
        "fs/promises",
        "node:test",
        "test",
        "unknown",
      ].map((n) => m.isBuiltin(n)),
    };
  },
  httpInternals: function ({
    httpCommon: c,
    httpOutgoing: o,
    httpServer: s,
    http,
  }) {
    const target = {};
    s.storeHTTPOptions.call(target, {
      requestTimeout: 12000,
      headersTimeout: 5000,
      requireHostHeader: false,
    });
    const errors = [];
    for (const fn of [
      () => s.setupConnectionsTracking(),
      () => s._connectionListener(),
      () =>
        s.storeHTTPOptions.call({}, { requestTimeout: 1, headersTimeout: 2 }),
    ]) {
      try {
        fn();
        errors.push(null);
      } catch (e) {
        errors.push({ name: e.name, code: e.code });
      }
    }
    const closed = [];
    s.httpServerPreClose({
      closeIdleConnections() {
        closed.push(true);
      },
    });
    return {
      tokens: ["X-Test", "bad space", ""].map((n) => c._checkIsHttpToken(n)),
      headers: ["ok", "bad\r\nvalue"].map((n) => c._checkInvalidHeaderChar(n)),
      methods: c.methods === http.METHODS,
      classes:
        o.OutgoingMessage === http.OutgoingMessage && s.Server === http.Server,
      unique: [...o.parseUniqueHeadersOption(["X-A", ["x-a", "X-B"]])],
      none: o.parseUniqueHeadersOption(null),
      target: {
        requestTimeout: target.requestTimeout,
        headersTimeout: target.headersTimeout,
        requireHostHeader: target.requireHostHeader,
      },
      errors,
      closed,
    };
  },
};
