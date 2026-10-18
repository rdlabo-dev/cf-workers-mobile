import { LocalStorageKV } from "@rdlabo/workers-capacitor/cloudflare/bindings/kv";
import { openFeature } from "@rdlabo/workers-capacitor/contracts";
import { FetchImplementation } from "@rdlabo/workers-capacitor/cloudflare/workers";
import worker from "../fixtures/workers/compatibility/kv";
export async function kvRequest(
  namespace: string,
  method: string,
  body?: string,
) {
  const kv = await openFeature(new LocalStorageKV(namespace));
  try {
    const runtime = await openFeature(
      new FetchImplementation({
        worker,
        baseURL: "https://worker.invalid",
        env: { KV: kv.api },
      }),
    );
    try {
      const response = await runtime.api("https://worker.invalid/kv", {
        method,
        body,
      });
      return { status: response.status, body: await response.text() };
    } finally {
      await runtime.dispose();
    }
  } finally {
    await kv.dispose();
  }
}
export async function verifyKVPersistence() {
  const namespace = `persistence-${crypto.randomUUID()}`;
  try {
    const put = await kvRequest(namespace, "PUT", "日本語 🍷");
    const get = await kvRequest(namespace, "GET");
    if (put.status !== 204 || get.status !== 200 || get.body !== "日本語 🍷")
      throw new Error("KV did not survive feature disposal and recreation");
  } finally {
    await kvRequest(namespace, "DELETE");
  }
  const first = await openFeature(new LocalStorageKV(namespace));
  try {
    await first.api.put("binary", new Uint8Array([0, 255]), {
      metadata: { version: 1 },
      expirationTtl: 120,
    });
  } finally {
    await first.dispose();
  }
  const second = await openFeature(new LocalStorageKV(namespace));
  try {
    const stored = await second.api.getWithMetadata<{ version: number }>(
      "binary",
      "arrayBuffer",
    );
    const listed = await second.api.list();
    if (
      JSON.stringify([...new Uint8Array(stored.value!)]) !== "[0,255]" ||
      stored.metadata?.version !== 1 ||
      !listed.keys[0]?.expiration
    )
      throw new Error(
        "KV did not persist bytes, metadata and expiration together",
      );
  } finally {
    await second.api.delete("binary");
    await second.dispose();
  }
}
