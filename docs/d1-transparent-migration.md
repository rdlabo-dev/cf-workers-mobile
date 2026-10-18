# D1-backed Workers in Capacitor

Use the existing Worker entry and its existing HTTP routes. The build integration
keeps server operations on the deployed Worker and generates the client dispatch;
application developers do not write another REST API, replace D1 calls with fetch,
or maintain a second router.

## Setup

```ts
// vite.config.ts — Capacitor build only
import { capacitorWorkersPlugin } from "@rdlabo/capacitor-workers/vite";

export default {
  plugins: [capacitorWorkersPlugin({ worker: "worker/src/index.ts" })],
};
```

The plugin reads `d1_databases` from the nearest Wrangler JSON/JSONC/TOML
configuration near the Worker entry, or from the build root. Binding names in
named environments are included. Configuration secrets and database IDs are not
copied into the generated client. An explicit `workerConfig` path is relative to
the build root. For other configuration tools, supply `d1Bindings: ["DB"]`.
The esbuild plugin accepts the same options.

```ts
// App startup — the business Worker remains unchanged
import { capacitorWorkers } from "@rdlabo/capacitor-workers";

const runtime = capacitorWorkers({
  baseURL: "https://local.invalid/",
  remote: {
    origin: "https://existing-worker.example.com",
    // Optional: connect an existing session when requests do not already
    // contain their Authorization header. This is not a new login system.
    getToken: () => existingSession.getToken(),
  },
});
await runtime.ready;

// The existing URL and HTTP contract are unchanged.
const response = await fetch("/api/counters/alice");
```

The deployed Worker retains its existing authentication, authorization, input
validation, business operations and D1 bindings. There is no generic SQL endpoint,
query-ID endpoint, client D1 implementation, schema migration API, or Cloudflare
management token in the client. Deploying the server remains a separate action.

## How execution is selected

For statically analyzable Hono applications, the compiler follows local module
imports and re-exports, helpers, mounted routers, chained registrations and
middleware. It generates a selector with the same Hono matching rules. If any
matching operation requires server execution, the entire request goes to the
existing Worker **before any local application middleware or handler runs**.
This also covers fallthrough and overlapping routes. Pure routes remain local.

D1 bindings, server `env` values, unknown dependency behavior, dynamic property
access, and mutable state shared with server operations widen the server boundary.
An `env` binding may be explicitly kept local with the build option
`localBindings: ["LABEL"]` when it is supplied through `capacitorWorkers({ env })`.
A D1 binding cannot be declared local. Unknown top-level initialization, internal router dispatch, ambient global state
and cookie/header state also keep the entire Worker on the server.
The analysis is deliberately conservative;
it can send more work to the server than a human could safely separate.

When splitting cannot preserve dispatch semantics, the generated client delegates
**all requests to the existing Worker** and contains none of its application
implementation. This includes general Fetch handlers and Workers Express.
The build reports the reason instead of requiring users to rewrite their Worker.
This mode requires connectivity for every intercepted request; it does not make
the existing application available offline. It is never selected by catching a
D1 error after partly running an operation.

Both build integrations emit `capacitor-workers-d1.json` describing the selected
mode and route/middleware registrations. This report is diagnostic metadata,
not a second router maintained by application authors.

## Code removal and execution boundaries

The compiler generates the local graph before the bundler creates client source
maps. Removed handlers and their unused helpers are absent from the generated
source, including `sourcesContent`. The same graph feeds direct and Dedicated
Worker execution. Importing original Worker modules separately into the client
is rejected because it would bypass removal. Do not manually copy server source,
SQL/migration files or server maps into public assets; those files are not part
of the generated module graph. Use a clean output directory when packaging.

The selector and connection run in the host in both execution modes. Session
callbacks stay in the host and are not structured-cloned into a Dedicated Worker.
The request goes directly through the existing outbound transport, even if the
remote origin overlaps the local interception URL. No local fetch recursion is
used. Native requests use the existing TCP/TLS transport and owned socket scopes.
Browser requests retain CORS and buffer upload bodies for WebKit/HTTP/1 support.
Native manual document requests retain streaming; Fetch follow mode buffers an
upload so a same-origin 307/308 can replay its body.

Path, query, method, body and response status are preserved. An existing
Authorization header is reused unless `getToken` is supplied. In that case the
current token replaces it on each request; an absent token removes stale bearer
credentials.

On native Capacitor, existing server-managed cookie sessions use the OS cookie
store for the remote host. Set-Cookie is processed in the host before redirecting;
HttpOnly cookies are not exposed to the rendered document. Path, expiry and
persistent-cookie logout semantics are retained. Local document cookies are never
blindly forwarded. Cookie-dependent Workers run entirely on the deployed Worker
so login, profile and logout share one session boundary. Users sign in through
the existing login page; cookies from a separate desktop browser are not imported.
Use `render: "/"` alongside `remote: { origin }` to render the existing Worker UI.

Native redirects within the configured remote origin retain HTTP semantics:
303 changes POST to GET, 307/308 preserve method/body, and manual document
redirects map back into the application's logical origin. Redirect chains are
bounded. Redirects to a different origin are rejected before credentials are
sent there. External OAuth/SSO flows need an explicit external-browser integration
and are not supplied here. Client-side scripts depending on reading remote
non-HttpOnly cookies through local `document.cookie` are also not bridged.

In ordinary browsers, remote requests use `credentials: "include"`; the deployed
Worker must allow the actual app Origin and credentials in CORS responses.
Wildcard Access-Control-Allow-Origin is insufficient. Browser cookie privacy and
SameSite rules still apply. Browsers hide manual redirect locations, so remote
redirects report an explicit unsupported error there. Native document acceptance
must therefore be run on iOS/Android, not inferred from browser API tests.

401 and network failures are returned without automatic retries or local
fallback. Abort and runtime disposal cancel pending credential lookup/transport;
a late token cannot send after disposal. SQL removal reduces disclosure of the
server implementation; it does not replace server-side authorization or identify
arbitrary hardcoded secrets in otherwise local application code.

## Verification

Root `npm test` includes compiler/configuration and remote-runtime tests.
After root build and installing demo dependencies, run:

```sh
cd demo
npm run test:d1-migration
```

The integration uses an unchanged ordinary Hono Worker and local workerd D1.
It checks public startup through Vite/esbuild, Chromium/WebKit, and direct/isolated
execution, both selective and whole-Worker execution. Checks include existing
read/write behavior, database state, authorization, 401 without retries, HEAD,
local routes without network, and removal of SQL/helper markers from JS and maps.
The suite also checks Vite development startup, original-source rejection and
recompilation after a file edit. It is included in the compatibility CI job.

Reproducible native verification uses a fresh npm-tarball consumer, an independent
app ID, a local HTTPS test server, and a test certificate trusted only by the
simulator/debug consumer:

```sh
node demo/tests/experiments/d1/native-server.mjs
# In another shell, after npm run build:
node demo/tests/experiments/d1/native-prepare.mjs
node demo/tests/experiments/d1/native-run.mjs ios <simulator-uuid>
node demo/tests/experiments/d1/native-run.mjs android <emulator-serial>
```

Run the platforms sequentially because the test database is shared. Android
uses Java 21 from Android Studio by default; `D1_JAVA_HOME` can override it.
`native-prepare.mjs --refresh` repacks the candidate and updates that same isolated
consumer. Reports, logs, package integrity and server-side DB snapshots are in
`demo/artifacts/d1-native/`. Browser reports and inspected bundles are in
`demo/artifacts/d1-integration/`.

On 2026-10-18, iOS 26.1 and Android 16 passed 20 checks each over real native HTTPS:
both execution modes, local HTML/JSON, real D1 updates, authorization, HEAD,
abort, disposal of in-flight requests and reinitialization. These are simulator
and emulator results, not physical-device or production deployment evidence.
The old standalone `/auth` helper and manual API-rewrite/schema-administration
guides were removed; this unreleased API does not retain their compatibility.

For rendered Cookie-session acceptance, use the same scripts with `--ui`:

```sh
node demo/tests/experiments/d1/native-server.mjs --ui
node demo/tests/experiments/d1/native-prepare.mjs --ui
node demo/tests/experiments/d1/native-run.mjs ios <simulator-uuid> --ui
node demo/tests/experiments/d1/native-run.mjs android <emulator-serial> --ui
```

The independent UI consumer uses `render: "/ui/account"` and an ordinary Worker
with no Capacitor imports. A test-only DOM driver fills inputs and activates real
forms/links in the rendered WebView; it does not replace navigation with API calls.
The same Worker runs in workerd. Tests check CSS/JS assets, login, a single D1
write through POST/303/GET, detail navigation, persistent session after process
restart, logout, and another restart remaining unauthenticated. Server-side D1
snapshots, screenshots and reports are saved in `demo/artifacts/d1-native-ui/`.
Run platforms sequentially. `native-prepare.mjs --ui --refresh` updates that
consumer from a new package tarball.

The review-cycle candidate on 2026-10-18 passed 332 unit tests, the browser D1
matrix plus Vite development rebuild, and the fresh-package consumer suite.
Both iOS 26.1 simulator and Android 16 emulator passed the rendered UI sequence
above, including logout with the server session deliberately left valid: only
Cookie deletion can make the subsequent restart unauthenticated. These UI
results cover the default Dedicated Worker execution preference and native host
transport. Browser/direct API combinations remain covered separately by the
integration matrix; the UI sequence is not a claim about every authentication
provider, browser privacy policy, or physical device.
