import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { fileURLToPath } from "node:url";
const fixture = fileURLToPath(new URL("worker.js", import.meta.url));
export const config = {
  r2_buckets: [{ binding: "BUCKET", bucket_name: "private-bucket-name" }],
  kv_namespaces: [{ binding: "CLOUD_KV", id: "private-kv-id" }],
  services: [
    { binding: "INTERNAL", service: "private-internal" },
    { binding: "RPC", service: "private-internal", entrypoint: "Calculator" },
  ],
  queues: { producers: [{ binding: "JOBS", queue: "private-queue-name" }] },
};
export async function createBackend() {
  const server = await build({
    stdin: {
      contents: `import app from ${JSON.stringify(fixture)};let effects=0;export default {async fetch(req,env,ctx){effects++;const res=await app.fetch(req,env,ctx);res.headers.set('x-effects',String(effects));return res;}};`,
      resolveDir: fileURLToPath(new URL("../../../../", import.meta.url)),
    },
    bundle: true,
    format: "esm",
    platform: "browser",
    write: false,
  });
  const backend = new Miniflare(
    convertV4MiniflareOptions({
      workers: [
        {
          name: "application",
          modules: true,
          script: server.outputFiles[0].text,
          compatibilityDate: "2026-10-01",
          r2Buckets: ["BUCKET"],
          kvNamespaces: ["CLOUD_KV"],
          serviceBindings: {
            INTERNAL: "internal",
            RPC: { name: "internal", entrypoint: "Calculator" },
          },
          queueProducers: { JOBS: "jobs" },
        },
        {
          name: "internal",
          modules: true,
          compatibilityDate: "2026-10-01",
          script: `import {WorkerEntrypoint} from 'cloudflare:workers';export class Calculator extends WorkerEntrypoint {add(a,b){return a+b;}}export default {fetch(){return new Response('internal-worker-result')}};`,
        },
        {
          name: "consumer",
          modules: true,
          compatibilityDate: "2026-10-01",
          kvNamespaces: ["RESULTS"],
          queueConsumers: { jobs: { maxBatchSize: 1, maxBatchTimeout: 0 } },
          script: `export default {async queue(batch,env){for(const message of batch.messages){await env.RESULTS.put(message.body.id,JSON.stringify(message.body));message.ack();}}};`,
        },
      ],
    }),
  );
  await backend.ready;
  return backend;
}
