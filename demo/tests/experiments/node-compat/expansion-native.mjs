import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { build } from "esbuild";

import { eventCases } from "../../../../src/compat/expansion/index.spec.mjs";
import { nativeBackend } from "../../native/backend.mjs";
import { runNativeAcceptance } from "../../native/acceptance.mjs";
const [platform, device] = process.argv.slice(2);
assert.ok(
  ["ios", "android"].includes(platform) && device,
  "Usage: node expansion-native.mjs ios|android <device>",
);
const root = fileURLToPath(new URL("../../../..", import.meta.url));
const baseline = JSON.parse(
  await readFile(
    new URL(
      "../../../artifacts/node-inventory/expansion-contracts-workerd.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const profile = JSON.parse(
  await readFile(new URL("exports.json", import.meta.url), "utf8"),
).profile;
assert.deepEqual(baseline.profile, profile);
assert.deepEqual(Object.keys(baseline.results), Object.keys(eventCases));
const artifacts = fileURLToPath(
  new URL(
    `../../../artifacts/node-inventory/native-expansion/${platform}/`,
    import.meta.url,
  ),
);
await mkdir(artifacts, { recursive: true });
await mkdir(`${artifacts}/public`, { recursive: true });
await writeFile(
  `${artifacts}/public/index.html`,
  "<!doctype html><title>Compatibility expansion fixture</title>",
);
await writeFile(
  `${artifacts}/worker.ts`,
  'export default {fetch() {return new Response("Compatibility fixture");}};',
);
await writeFile(
  `${artifacts}/wrangler.json`,
  JSON.stringify({
    name: "events-native-fixture",
    main: "worker.ts",
    compatibility_date: profile.compatibilityDate,
    assets: { directory: "./public", binding: "ASSETS" },
  }),
);
await mkdir(`${artifacts}/local`, { recursive: true });
await writeFile(
  `${artifacts}/local/worker.ts`,
  'export default {fetch() {return new Response("Events local fixture");}};',
);
await writeFile(
  `${artifacts}/local/wrangler.json`,
  JSON.stringify({
    name: "events-local-fixture",
    main: "worker.ts",
    compatibility_date: profile.compatibilityDate,
  }),
);
const { consumer, tarball, tarballSha256 } = JSON.parse(
  await readFile(
    new URL(
      "../../../artifacts/node-inventory/events-consumer.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const { workersCapacitorPlugin } = await import(
  pathToFileURL(
    `${consumer}/node_modules/cf-workers-native/dist/tooling/esbuild.js`,
  ).href
);
const compiled = await build({
  absWorkingDir: consumer,
  stdin: {
    resolveDir: consumer,
    contents: `import * as net from 'node:net'; import * as tls from 'node:tls'; import * as streams from 'node:stream/web'; import * as module from 'node:module'; import * as httpCommon from 'node:_http_common'; import * as httpOutgoing from 'node:_http_outgoing'; import * as httpServer from 'node:_http_server'; import * as http from 'node:http'; import * as fs from 'node:fs'; import * as zlib from 'node:zlib'; import * as sys from 'node:sys'; import * as util from 'node:util'; import * as types from 'node:util/types'; import * as console from 'node:console'; import * as crypto from 'node:crypto';
import { eventCases } from ${JSON.stringify(root + "/src/compat/expansion/index.spec.mjs")};
import { AsyncLocalStorage } from 'node:async_hooks';
import process from 'node:process';
export const run = name => eventCases[name]({process, tls, streams, sys, util, types, console, crypto, fs, zlib, module, httpCommon, httpOutgoing, httpServer, http});
export {createNetworkRelay, initializeWorkerNetwork} from ${JSON.stringify(consumer + "/node_modules/cf-workers-native/dist/browser/fetch/relay.js")};
export const runTls = async port => {
 const attempt = servername => new Promise((resolve,reject)=> {
  let accepted=false, body='';
  const socket=tls.connect({host:'127.0.0.1',port,servername});
  const timer=setTimeout(()=>{socket.destroy();reject(new Error('TLS timeout: '+servername));},8000);
  socket.on('secureConnect',()=>{accepted=socket.authorized && socket.encrypted;socket.write('GET /tls-native HTTP/1.1\\r\\nHost: localhost\\r\\nConnection: close\\r\\n\\r\\n');});
  socket.on('data',chunk=>{body+=chunk.toString();});
  socket.on('error',()=>{clearTimeout(timer);resolve({accepted,received:false});});
  socket.on('end',()=>{clearTimeout(timer);resolve({accepted,received:body.includes('404') && body.includes('Not found')});});
 });
 const valid=await attempt('localhost'), invalid=await attempt('wrong.invalid');
 const plain=net.connect({host:'127.0.0.1',port});
 plain.on('error',()=>{});
 let upgradeRejected=false;
 try {
  await new Promise((resolve,reject)=>{plain.once('connect',resolve);plain.once('error',reject);});
  try {tls.connect({socket:plain,servername:'localhost'}).write('must-never-be-plaintext');}
  catch(error){if(error.code!=='ERR_METHOD_NOT_IMPLEMENTED')throw error;upgradeRejected=true;}
 } finally {plain.destroy();}
 return {valid,invalid,upgradeRejected};
};`,
  },
  bundle: true,
  platform: "browser",
  format: "esm",
  write: false,
  outfile: `${artifacts}/candidate.js`,
  plugins: [
    workersCapacitorPlugin({
      execution: "local",
      worker: `${artifacts}/local/worker.ts`,
      workerConfig: `${artifacts}/local/wrangler.json`,
    }),
  ],
});
const source = compiled.outputFiles[0].text;
const hash = createHash("sha256").update(source).digest("hex");
await writeFile(`${artifacts}/candidate.js`, source);
await writeFile(
  `${artifacts}/inputs.json`,
  JSON.stringify(
    {
      profile,
      hash,
      platform,
      device,
      tarball,
      tarballSha256,
      cases: Object.keys(eventCases),
    },
    null,
    2,
  ),
);
// Allow emulator clock drift without disabling TLS verification.
const tlsDirectory = `${artifacts}/tls`;
await mkdir(tlsDirectory, { recursive: true });
await writeFile(`${tlsDirectory}/index`, "");
await writeFile(`${tlsDirectory}/serial`, "01\n");
await writeFile(
  `${tlsDirectory}/ca.cnf`,
  `[ca]
default_ca=local
[local]
database=${tlsDirectory}/index
new_certs_dir=${tlsDirectory}
serial=${tlsDirectory}/serial
private_key=${tlsDirectory}/key.pem
default_md=sha256
policy=policy
x509_extensions=extensions
[policy]
commonName=supplied
[extensions]
subjectAltName=DNS:localhost,IP:127.0.0.1
basicConstraints=critical,CA:TRUE
`,
);
execFileSync(
  "openssl",
  [
    "req",
    "-new",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    `${tlsDirectory}/key.pem`,
    "-out",
    `${tlsDirectory}/request.pem`,
    "-subj",
    "/CN=Compatibility expansion acceptance",
  ],
  { stdio: "pipe" },
);
const certificateTime = (time) =>
  new Date(time)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/T/, "")
    .slice(0, 14) + "Z";
execFileSync(
  "openssl",
  [
    "ca",
    "-batch",
    "-selfsign",
    "-config",
    `${tlsDirectory}/ca.cnf`,
    "-in",
    `${tlsDirectory}/request.pem`,
    "-out",
    `${tlsDirectory}/ca.pem`,
    "-startdate",
    certificateTime(Date.now() - 86400000),
    "-enddate",
    certificateTime(Date.now() + 172800000),
  ],
  { stdio: "pipe" },
);
const backend = await nativeBackend({
  tlsDirectory,
  dispatch: async () => new Response("Not found", { status: 404 }),
  driver: "",
  dispose: async () => {},
  instrument: () => false,
});
const bootstrapCode = `
async function main() {
const source = ${JSON.stringify(source)};
const names = ${JSON.stringify(Object.keys(eventCases))};
const report = async value => {await fetch(${JSON.stringify(backend.url.origin + "/__acceptance/report")}, {method:'POST', mode:'no-cors', headers:{'content-type':'text/plain'}, body:JSON.stringify(value)});};
const results = {};
try {
 for (const mode of ['page', 'worker']) {
  results[mode] = {};
  for (const name of names) {
   const url = URL.createObjectURL(new Blob([source], {type:'text/javascript'}));
   try {
    if (mode === 'page') { const api = await import(/* @vite-ignore */ url); results[mode][name] = JSON.parse(JSON.stringify(await api.run(name))); }
    else {
     const workerURL = URL.createObjectURL(new Blob(['import {run} from ' + JSON.stringify(url) + '; self.onmessage = async ({data}) => {try {self.postMessage({value:JSON.parse(JSON.stringify(await run(data)))});} catch(error) {self.postMessage({error:String(error)});}};'], {type:'text/javascript'}));
     const worker = new Worker(workerURL, {type:'module'});
     try {
      results[mode][name] = await new Promise((resolve,reject) => {
       const timer = setTimeout(() => reject(new Error('Worker timeout: '+name)), 8000);
       worker.onmessage = ({data}) => {clearTimeout(timer); data.error ? reject(new Error(data.error)) : resolve(data.value);};
       worker.onerror = event => {clearTimeout(timer);reject(new Error(event.message || 'Worker error'));};
       worker.postMessage(name);
      });
     } finally {worker.terminate(); URL.revokeObjectURL(workerURL);}
    }
   } finally {URL.revokeObjectURL(url);}
  }
 }
 const tlsURL=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
 const tlsApi=await import(/* @vite-ignore */ tlsURL);
 const nativeTls={page:await tlsApi.runTls(${JSON.stringify(Number(backend.url.port))})};
 const workerURL=URL.createObjectURL(new Blob(['import {runTls, initializeWorkerNetwork} from '+JSON.stringify(tlsURL)+'; self.onmessage=async ({data})=>{try {await initializeWorkerNetwork();self.postMessage({tls:await runTls(data)});}catch(e){self.postMessage({error:String(e)});}};'],{type:'text/javascript'}));
 const tlsWorker=new Worker(workerURL,{type:'module'});
 const relay=tlsApi.createNetworkRelay(tlsWorker);
 tlsWorker.addEventListener('message',relay.receive);
 try {nativeTls.worker=await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new Error('Worker TLS timeout')),20000);
  tlsWorker.onmessage=({data})=>{if(data.tls || data.error){clearTimeout(timer);data.error?reject(new Error(data.error)):resolve(data.tls);}};
  tlsWorker.postMessage(${JSON.stringify(Number(backend.url.port))});
 });} finally {tlsWorker.terminate();await relay.dispose();URL.revokeObjectURL(workerURL);URL.revokeObjectURL(tlsURL);}
 await report({stage:'complete', nativeTls, hash:${JSON.stringify(hash)}, results});
 document.body.textContent = 'Compatibility contracts complete';
} catch(error) {await report({stage:'failure', message:String(error), stack:error.stack});document.body.textContent=String(error);}
}
main();
`;
await runNativeAcceptance({
  backend,
  artifacts,
  platform,
  device,
  bootstrapCode,
  shell: consumer,
  appId: "jp.rdlabo.workerscapacitor.events",
  worker: `${artifacts}/worker.ts`,
  workerConfig: `${artifacts}/wrangler.json`,
  validate: async (backend) => {
    const completed = backend.reports.find(
      (report) => report.stage === "complete",
    );
    assert.equal(completed.hash, hash);
    for (const mode of ["page", "worker"])
      assert.deepEqual(completed.nativeTls[mode], {
        valid: { accepted: true, received: true },
        invalid: { accepted: false, received: false },
        upgradeRejected: true,
      });
    assert.deepEqual(Object.keys(completed.results).sort(), ["page", "worker"]);
    for (const mode of ["page", "worker"])
      assert.deepEqual(completed.results[mode], baseline.results);
  },
});
console.log(
  `${platform}: ${Object.keys(eventCases).length} operation groups passed in page and Dedicated Worker (${hash})`,
);
