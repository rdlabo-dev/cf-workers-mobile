import type { KVTextNamespace } from "@rdlabo/workers-capacitor/features/kv";
/** The same handler runs against Workers KV and the WebView binding. */
export default {
  async fetch(request: Request, env: { KV: KVTextNamespace }) {
    const key = new URL(request.url).searchParams.get("key") ?? "key";
    if (request.method === "PUT") {
      await env.KV.put(key, await request.text());
      return new Response(null, { status: 204 });
    }
    if (request.method === "DELETE") {
      await env.KV.delete(key);
      return new Response(null, { status: 204 });
    }
    const value = await env.KV.get(key);
    return new Response(value, { status: value === null ? 404 : 200 });
  },
};
