# Hyperdrive-backed Workers in Capacitor

Reuse the existing Worker entry, routes, database driver and SQL. The Capacitor
build generates HTTP dispatch to the deployed Worker for server operations:

```text
Capacitor: POST /api/orders
  → HTTPS https://existing-worker.example/api/orders
  → existing Worker authentication, authorization and validation
  → existing database driver → Hyperdrive → PostgreSQL or MySQL
  → existing HTTP response → Capacitor
```

The client sends the existing HTTP request, not SQL or a database protocol.
Hyperdrive's binding, credentials, pooling and caching remain on Cloudflare.
This package does not emulate Hyperdrive, connect the mobile device to the
origin database, create a generic SQL endpoint or deploy the server.

## Setup

Keep the existing Wrangler configuration with `hyperdrive` entries (including
named environments). The Vite/esbuild plugin reads binding names only; IDs and
`localConnectionString` values are not copied to the client.

```ts
// Capacitor's vite.config.ts
import { workersCapacitorPlugin } from "@rdlabo/workers-capacitor/vite";
export default {
  plugins: [workersCapacitorPlugin({ worker: "worker/src/index.ts" })],
};
```

The nearest Wrangler JSON, JSONC or TOML configuration near the Worker entry is
used, falling back to the build root. To select another file, use `workerConfig`
(relative to the build root). For other configuration tools, supply
`hyperdriveBindings: ["HYPERDRIVE"]`. Explicit `d1Bindings` and
`hyperdriveBindings` override discovery for their own binding kind only. D1 and
Hyperdrive can coexist. An explicit empty list disables discovery for that kind;
do not disable it for server bindings the Worker actually uses.

```ts
import { workersCapacitor } from "@rdlabo/workers-capacitor";
const runtime = workersCapacitor({
  baseURL: "https://local.invalid/",
  remote: {
    origin: "https://existing-worker.example",
    // Optional: use the application's existing user session.
    getToken: () => existingSession.getToken(),
  },
});
await runtime.ready;
const response = await fetch("/api/orders", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ productId: "example", quantity: 1 }),
});
```

The deployed Worker still needs its normal Hyperdrive configuration, supported
driver and compatibility flags. See Cloudflare's
[MySQL](https://developers.cloudflare.com/hyperdrive/examples/connect-to-mysql/)
and [PostgreSQL](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/)
guides. Existing ORM code follows the same boundary; this does not certify every
ORM or driver version.

## Execution and code removal

Statically analyzable Hono routes independent of server operations stay local.
When a matching operation needs Hyperdrive, the whole request goes to the
existing Worker before any local application middleware executes. Imported
helpers and server driver imports are removed with their handlers before client
JavaScript and source maps are generated. The direct and Dedicated Worker modes
use the same generated boundary.

A top-level connection pool, shared mutable state, Cookie dependencies, unknown
initialization or uncertain routing can require the entire Worker to stay remote.
General Fetch handlers use whole-Worker delegation. The build warns about its
decision and emits `workers-capacitor-server.json` with mode, reason and route
registrations. D1-only builds retain `workers-capacitor-d1.json` for compatibility.
Hyperdrive bindings cannot be declared in `localBindings`.

Transactions and connection cleanup stay inside the existing server handler.
401 and network failures do not trigger automatic retries or local fallback.
A failed response can still follow a committed write; applications needing safe
user retries must implement their existing server-side idempotency policy.
Whole-Worker delegation needs connectivity for every intercepted request.

## Security boundaries

- `remote.origin` must be an HTTPS origin, with no credentials, path, query or
  fragment. Redirects must stay within that origin; external OAuth/SSO needs
  separate integration.
- The server must authenticate users and authorize access to each resource.
  Client routing and SQL removal are not authorization controls. Keep parameter
  binding, input validation and appropriate database permissions in the Worker.
- Use user-scoped credentials. Never place database credentials or Cloudflare
  management tokens in client `env`, token callbacks, logs or public assets.
  Generated code removal does not scan manually copied public files or detect
  arbitrary hardcoded secrets in otherwise local code.
- Native Cookie sessions use the remote host's cookie store. `Set-Cookie` is
  processed by the host and stripped from the page response. HttpOnly prevents
  script access to the Cookie, not authenticated requests by compromised scripts.
- The adapter remaps app-local `Origin`/`Referer` to the remote origin for existing
  Worker navigation. Consequently, the server cannot treat the remapped Origin
  alone as proof of trusted user intent. Retain the application's CSRF token
  checks where used, restrict WebView content/navigation and native bridge access,
  and assess XSS and CSRF in the actual application. This is not a guarantee of
  browser-equivalent SameSite/CSRF protection in native transport.
- Ordinary browsers still require credentialed CORS and obey browser Cookie
  policies. Browser manual remote redirects are unsupported.
- Browser uploads and native Fetch redirect-follow uploads are buffered. The
  shared remote transport currently has no explicit body-size cap, so large
  bodies can exhaust client memory. Manual native document requests stream;
  enforce suitable upload limits before constructing/sending buffered bodies.

The shared transport and Cookie behavior are detailed in the
[D1 guide](d1-transparent-migration.md). Hyperdrive adds build-time binding
recognition; it does not add a separate credential or network transport.

## Verification

`npm test` covers JSON/JSONC/TOML and named-environment discovery, mixed D1 and
Hyperdrive overrides, local-binding rejection, nested configuration discovery,
removal of driver/helper/SQL code and top-level pool fallback.

For the browser integration, build the package, install demo dependencies and
provide a **dedicated disposable MySQL test database**. The suite creates
`private_counters` and resets its `alice`/`bob` rows; never point it at application
data. Then run:

```sh
npm run build
cd demo
HYPERDRIVE_TEST_MYSQL_URL='mysql://root:hyperdrive-test-only@127.0.0.1:3306/hyperdrive_test' npm run test:hyperdrive-migration
```

The same unmodified fixture Worker executes in workerd with a local Hyperdrive
binding and mysql2 against real MySQL. Browser HTTPS requests are intercepted by
the test harness and dispatched to that local Worker. Tests cover Vite/esbuild,
Chromium/WebKit, direct/Dedicated Worker, selective/whole-Worker delegation,
Vite development rebuilds, authorization, one database update per request,
HEAD, local routes without network, and absence of SQL/driver/configuration
markers from client JS and source maps. Reports are written to
`demo/artifacts/hyperdrive-integration/`. CI supplies its own MySQL service.

This checks local Hyperdrive binding and database behavior, not production
Hyperdrive pooling/caching or physical-device HTTPS. PostgreSQL/ORM imports are
covered for compiler removal, not live PostgreSQL queries. The prior D1 native
acceptance covers the shared transport; it is not a Hyperdrive native acceptance
result. Server deployment, production credentials and physical devices are not
part of this verification.

On 2026-10-18, the candidate passed build and root/demo typechecks, 344 unit
checks, 7 build-tool checks, and both the Hyperdrive and D1 browser matrices
(16 production-build combinations plus development checks each). The fresh
npm-tarball consumer passed Vite/esbuild/browser ESM 10/10, Vite dev 2/2,
direct 26/26, isolated 22/22, 320 common checks with 6 declared unsupported,
and preferences 2/2. These results have the local-server and device limitations
above; they are not a production security certification.
