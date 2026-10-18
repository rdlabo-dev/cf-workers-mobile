import net from "node:net";
import { handleAsNodeConnection, connectHandler } from "cloudflare:node";
import {
  runNetIncomingContract,
  runNetNetworkContract,
} from "../../../src/compat/net/index.spec";
import { request, get } from "node:http";
import {
  nodeHttpNetworkContract,
  nodeHttpNetworkFeature,
} from "../../../src/compat/http/index.spec";
import { workersCapacitor } from "../../../dist/index";
import { createFetch } from "../../../dist/compat/fetch";
import { Request } from "../../../dist/compat/request";
import {
  fetchPolicyContract,
  fetchPolicyFeature,
} from "../../../src/compat/fetch/policy.spec";
import { FetchTransport } from "../../../dist/compat/fetch/transport";
import {
  createNativeNetwork,
  type NativeCall,
} from "../../../dist/compat/fetch/native-network";
import { createNetworkScope } from "../../../dist/compat/fetch/scope";

declare const __NETWORK_TLS__: boolean;
type Result = { name: string; ok: boolean; error?: string };
/** The same raw-transport cases run on iOS and Android against fixtures/network. */
export async function runNativeNetwork(
  baseURL: string,
  call?: NativeCall,
): Promise<Result[]> {
  const results: Result[] = [];
  const assert = (value: unknown) => {
    if (!value) throw new Error("Native transport assertion failed");
  };
  for (const name of [
    "get",
    "echo",
    "redirect",
    "cookies",
    "gzip",
    "abort",
    "early",
    "empty",
    "continue",
    "large",
    "abort-before-headers",
  ]) {
    const abort = new AbortController();
    const timer = setTimeout(
      () => abort.abort(new Error("Network case timed out")),
      15000,
    );
    const network = createNativeNetwork({ nativeCall: call });
    const transport = new FetchTransport(network);
    try {
      let body: ReadableStream<Uint8Array> | null = null;
      if (name === "echo" || name === "early")
        body = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("payload"));
            if (name === "echo") controller.close();
          },
        });
      const path =
        name === "abort"
          ? "slow"
          : name === "abort-before-headers"
            ? "never"
            : name;
      const pending = transport.fetch({
        url: `${baseURL}/${path}`,
        method: body ? "POST" : "GET",
        body,
        headers: [],
        signal: abort.signal,
        encodeResponseBody: "manual",
      });
      if (name === "abort-before-headers") {
        const cancel = setTimeout(
          () => abort.abort("header wait stopped"),
          100,
        );
        try {
          await pending;
          throw new Error("Header wait did not reject");
        } catch (error) {
          assert(error === "header wait stopped");
        } finally {
          clearTimeout(cancel);
        }
      } else {
        const response = await pending;
        if (name === "get" || name === "echo" || name === "continue")
          assert(
            (await new Response(response.body).text()) ===
              { get: "hello", echo: "payload", continue: "continued" }[name],
          );
        if (name === "redirect") {
          assert(response.status === 302);
          await response.body?.cancel();
        }
        if (name === "cookies") {
          assert(
            response.headers.filter(
              ([key]) => key.toLowerCase() === "set-cookie",
            ).length === 2,
          );
          await response.body?.cancel();
        }
        if (name === "gzip") {
          const bytes = new Uint8Array(
            await new Response(response.body).arrayBuffer(),
          );
          assert(bytes[0] === 31 && bytes[1] === 139);
        }
        if (name === "abort") {
          const reading = response.body!.getReader().read();
          abort.abort("body read stopped");
          try {
            await reading;
            throw new Error("Body read did not reject");
          } catch (error) {
            assert(error === "body read stopped");
          }
        }
        if (name === "early") {
          assert(response.status === 200);
          await response.body?.cancel();
        }
        if (name === "empty") {
          assert(response.status === 204);
          assert(response.body === null);
        }
        if (name === "large") {
          const reader = response.body!.getReader();
          let size = 0;
          for (;;) {
            const chunk = await reader.read();
            if (chunk.done) break;
            assert(chunk.value.length <= 65536);
            assert(chunk.value.every((byte) => byte === 97));
            size += chunk.value.length;
          }
          assert(size === 512 * 1024);
        }
      }
      results.push({ name, ok: true });
    } catch (error) {
      results.push({ name, ok: false, error: String(error) });
    } finally {
      clearTimeout(timer);
      abort.abort();
    }
  }
  if (call) {
    const scope = createNetworkScope(call);
    const network = createNativeNetwork({ nativeCall: scope.call });
    const connection = await network.open({
      url: `${baseURL}/never`,
      method: "GET",
      headers: [],
      hasBody: false,
    });
    try {
      const observed = connection.headers.then(
        () => false,
        () => true,
      );
      await scope.dispose();
      assert(await observed);
      results.push({ name: "runtime-disposal", ok: true });
    } catch (error) {
      results.push({
        name: "runtime-disposal",
        ok: false,
        error: String(error),
      });
    }
  }
  const scope = call ? createNetworkScope(call) : undefined;
  const fetch = createFetch(
    new FetchTransport(
      createNativeNetwork({ nativeCall: scope?.call ?? call }),
    ),
  );
  try {
    for (const name of fetchPolicyFeature.cases) {
      try {
        // The contract is source-owned; the native fixture deliberately executes
        // the compiled classes. Their private fields have separate TS identities.
        const api = { fetch, Request, baseURL } as unknown as Parameters<
          (typeof fetchPolicyContract.cases)[typeof name]
        >[0];
        await fetchPolicyContract.cases[name](api);
        results.push({ name: `policy: ${name}`, ok: true });
      } catch (error) {
        results.push({
          name: `policy: ${name}`,
          ok: false,
          error: String(error),
        });
      }
    }
  } finally {
    await scope?.dispose();
  }
  if (__NETWORK_TLS__) {
    for (const [name, url, accepted] of [
      ["valid", `https://${new URL(baseURL).hostname}:4204/`, true],
      ["untrusted", `https://${new URL(baseURL).hostname}:4205/`, false],
      ["hostname", `https://${new URL(baseURL).hostname}:4206/`, false],
      [
        "unclean EOF",
        `https://${new URL(baseURL).hostname}:4204/unclean-eof`,
        false,
      ],
      [
        "clean EOF",
        `https://${new URL(baseURL).hostname}:4204/clean-eof`,
        false,
      ],
    ] as const) {
      const signal = AbortSignal.timeout(15000);
      const transport = new FetchTransport(
        createNativeNetwork({ nativeCall: call }),
      );
      try {
        try {
          const response = await transport.fetch({
            url,
            method: "GET",
            headers: [],
            body: null,
            signal,
          });
          const reader = response.body?.getReader();
          if (reader) {
            try {
              while (!(await reader.read()).done) {
                /* Consume framing errors. */
              }
            } finally {
              reader.releaseLock();
            }
          }
          assert(accepted && response.status === 200);
        } catch (error) {
          if (
            accepted ||
            signal.aborted ||
            !(
              name.endsWith("EOF")
                ? /tls|ssl|reset|closed|eof/i
                : /certificate|ssl|tls|trust|handshake/i
            ).test(
              String(error).replace(/[a-z\d.-]+\.badssl\.com/gi, "endpoint"),
            )
          )
            throw error;
        }
        results.push({ name: `TLS ${name}`, ok: true });
      } catch (error) {
        results.push({ name: `TLS ${name}`, ok: false, error: String(error) });
      }
    }
  }
  const NativeRequest = globalThis.Request;
  const NativeResponse = globalThis.Response;
  const before = new NativeRequest("https://worker.invalid/echo", {
    method: "POST",
    body: "pre-install request",
  });
  const runtime = workersCapacitor({
    baseURL: "https://worker.invalid",
    worker: {
      async fetch(request) {
        return new NativeResponse(await request.text());
      },
    },
  });
  try {
    assert(
      (await (await globalThis.fetch(before)).text()) === "pre-install request",
    );
    assert(
      (await (await globalThis.fetch(`${baseURL}/get`)).text()) === "hello",
    );
    const compressed = await globalThis.fetch(`${baseURL}/brotli`);
    assert((await compressed.text()) === "compressed body");
    results.push({ name: "public API local and outbound", ok: true });
    try {
      await runNetNetworkContract(baseURL).catch((error) => {
        throw new Error(`outbound TCP: ${String(error)}`);
      });
      for (const accept of [handleAsNodeConnection, connectHandler().connect]) {
        await runNetIncomingContract(net as never, (socket) =>
          accept(socket as never),
        ).catch((error) => {
          throw new Error(`incoming TCP: ${String(error)}`);
        });
      }
      results.push({ name: "node:net real TCP", ok: true });
    } catch (error) {
      results.push({
        name: "node:net real TCP",
        ok: false,
        error: String(error),
      });
    }
    for (const name of nodeHttpNetworkFeature.cases) {
      try {
        await nodeHttpNetworkContract.cases[name]({ request, get, baseURL });
        results.push({ name: `node:http ${name}`, ok: true });
      } catch (error) {
        results.push({
          name: `node:http ${name}`,
          ok: false,
          error: String(error),
        });
      }
    }
  } catch (error) {
    results.push({
      name: "public API local and outbound",
      ok: false,
      error: String(error),
    });
  } finally {
    await runtime.dispose();
  }
  results.push({
    name: "public API restores globals",
    ok:
      globalThis.Request === NativeRequest &&
      globalThis.Response === NativeResponse,
  });
  return results;
}
