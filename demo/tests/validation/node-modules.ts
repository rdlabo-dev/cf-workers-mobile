import {
  TestImplementation,
  testContract,
} from "../../../src/compat/test/index.spec";
import {
  SqliteImplementation,
  sqliteContract,
} from "../../../src/compat/sqlite/index.spec";
import {
  ReplImplementation,
  replContract,
} from "../../../src/compat/repl/index.spec";
import {
  DomainImplementation,
  domainContract,
} from "../../../src/compat/domain/index.spec";
import {
  ReadlineImplementation,
  readlineContract,
} from "../../../src/compat/readline/index.spec";
import {
  InspectorImplementation,
  inspectorContract,
} from "../../../src/compat/inspector/index.spec";
import {
  ChildProcessImplementation,
  childProcessContract,
} from "../../../src/compat/child-process/index.spec";
import {
  ClusterImplementation,
  clusterContract,
} from "../../../src/compat/cluster/index.spec";
import {
  DgramImplementation,
  dgramContract,
} from "../../../src/compat/dgram/index.spec";
import {
  VmImplementation,
  vmContract,
} from "../../../src/compat/vm/index.spec";
import {
  Http2Implementation,
  http2Contract,
} from "../../../src/compat/http2/index.spec";
import {
  ConstantsImplementation,
  constantsContract,
} from "../../../src/compat/constants/index.spec";
import {
  V8Implementation,
  v8Contract,
} from "../../../src/compat/v8/index.spec";
import {
  PunycodeImplementation,
  punycodeContract,
} from "../../../src/compat/punycode/index.spec";
import {
  WasiImplementation,
  wasiContract,
} from "../../../src/compat/wasi/index.spec";
import {
  OsImplementation,
  osContract,
} from "../../../src/compat/os/index.spec";
import {
  TtyImplementation,
  ttyContract,
} from "../../../src/compat/tty/index.spec";
import {
  UrlImplementation,
  urlContract,
} from "../../../src/compat/url/index.spec";
import {
  AsyncHooksImplementation,
  asyncHooksContract,
  NodeAsyncHooks,
} from "../../../src/compat/async-hooks/index.spec";
import { installNodeGlobals } from "../../../src/compat/globals/index";
import {
  TimersImplementation,
  timersContract,
} from "../../../src/compat/timers/index.spec";
import { capacitorWorkers } from "@rdlabo/capacitor-workers";
// Environment runners share module-owned contracts. The node:* imports in
// their implementations resolve to workerd builtins or the bundler aliases.
import {
  runContract,
  type ContractResult,
} from "@rdlabo/capacitor-workers/testing";
import {
  nodePathContract,
  BundledPath,
  WorkersPath,
} from "../../../src/compat/path/index.spec";
import {
  nodeQuerystringContract,
  NodeQuerystring,
} from "../../../src/compat/querystring/index.spec";
import {
  nodeStringDecoderContract,
  NodeStringDecoder,
} from "../../../src/compat/string-decoder/index.spec";

import {
  nodeHttpContract,
  NodeHttp,
} from "../../../src/compat/http/index.spec";

import {
  NetImplementation,
  netContract,
} from "../../../src/compat/net/index.spec";

import {
  BufferImplementation,
  bufferContract,
} from "../../../src/compat/buffer/index.spec";

import {
  FsImplementation,
  fsContract,
} from "../../../src/compat/fs/index.spec";
import {
  ModuleImplementation,
  moduleContract,
} from "../../../src/compat/module/index.spec";
import {
  StreamWebImplementation,
  streamWebContract,
} from "../../../src/compat/stream-web/index.spec";
import {
  UtilImplementation,
  utilContract,
} from "../../../src/compat/util/index.spec";

export type NodeProfile = "bundled" | "workers";

export async function runNodeContracts(
  profile: NodeProfile = "bundled",
): Promise<ContractResult[]> {
  const reports = [
    await runContract(
      profile === "workers" ? new WorkersPath() : new BundledPath(),
      nodePathContract,
    ),
    await runContract(new NodeQuerystring(), nodeQuerystringContract),
    await runContract(new NodeStringDecoder(), nodeStringDecoderContract),
    await runContract(new NodeHttp(), nodeHttpContract),
    await runContract(new NetImplementation(), netContract),
    await runContract(new BufferImplementation(), bufferContract),
    await runContract(new TimersImplementation(), timersContract),
    await runContract(new UrlImplementation(), urlContract),
    await runContract(new OsImplementation(), osContract),
    await runContract(new TtyImplementation(), ttyContract),
    await runContract(new WasiImplementation(), wasiContract),
    await runContract(new PunycodeImplementation(), punycodeContract),
    await runContract(new ConstantsImplementation(), constantsContract),
    await runContract(new V8Implementation(), v8Contract),
    await runContract(new Http2Implementation(), http2Contract),
    await runContract(new VmImplementation(), vmContract),
    await runContract(new ChildProcessImplementation(), childProcessContract),
    await runContract(new ClusterImplementation(), clusterContract),
    await runContract(new DgramImplementation(), dgramContract),
    await runContract(new InspectorImplementation(), inspectorContract),
    await runContract(new DomainImplementation(), domainContract),
    await runContract(new ReadlineImplementation(), readlineContract),
    await runContract(new ReplImplementation(), replContract),
    await runContract(new SqliteImplementation(), sqliteContract),
    await runContract(new TestImplementation(), testContract),
  ];
  reports.push(
    await runContract(
      profile === "workers"
        ? new NodeAsyncHooks()
        : new AsyncHooksImplementation(),
      asyncHooksContract,
    ),
    await runContract(new FsImplementation(), fsContract),
    await runContract(new ModuleImplementation(), moduleContract),
    await runContract(new StreamWebImplementation(), streamWebContract),
    await runContract(new UtilImplementation(), utilContract),
  );
  return reports;
}

/** Standalone host validation owns a direct runtime, even when the app prefers a Worker. */
export async function runLocalNodeContracts(): Promise<ContractResult[]> {
  // This standalone contract harness has no configured application entry.
  // Own the same Node bootstrap used by loadDirect(); build-tool tests exercise
  // that public configured-entry path separately.
  const restoreNode = installNodeGlobals();
  const runtime = capacitorWorkers({
    baseURL: "https://node-contract.invalid",
    worker: { fetch: () => new Response(null, { status: 204 }) },
  });
  try {
    const reports = await runNodeContracts("bundled");
    // Reacquiring ownership after ALS use must not conflict or replace timers.
    const releaseAgain = installNodeGlobals();
    releaseAgain();
    return reports;
  } finally {
    await runtime.dispose();
    restoreNode();
  }
}
