# Integrate an existing Workers application with Capacitor

Give this guide to an AI coding assistant with access to your application
repository. It describes the work from installing Capacitor to configuring
`@rdlabo/workers-capacitor`, adapting unsupported application behavior and
verifying the native app. Preserve the existing Workers application and cloud
build, making only the changes required by the chosen integration.

## Prompt to give your AI assistant

```text
Follow docs/integration.md from rdlabo-dev/workers-capacitor to integrate this
application with Capacitor using @rdlabo/workers-capacitor.
Inspect the existing code first, then install/configure the required dependencies,
connect the existing Worker entry and verify the app on the target platforms.
Preserve the cloud build and existing authentication. Keep changes minimal.
Identify what runs locally and what must remain on the Worker. If a page depends
on D1 or another unsupported local service, explain the boundary and implement
only the necessary migration. Preserve local SSR where it helps initial display;
do not automatically rewrite the app as a SPA or require an App Shell redesign.
Follow the security section. Report files changed, verification results and
remaining limitations, distinguishing local execution from remote execution.
Do not deploy cloud resources or publish the app without explicit authorization.
```

Provide the target platforms, app ID/name, and an existing test Worker origin if
available. The assistant should infer entries, framework and scripts from the
repository, asking only for missing product choices or access it cannot infer.

## Workflow

1. Inspect the application and select native HTML rendering or Fetch-only integration.
2. Install Capacitor and this package in the application.
3. Configure the native build and connect the existing Worker.
4. Adapt server-dependent behavior only where necessary.
5. Check security and verify the actual application flow.

## 1. Inspect the application and choose the integration

Read the Worker entry, build scripts, Wrangler configuration, page routes,
middleware and authentication code. Record these decisions in the implementation
plan, rather than adding a permanent progress document:

- Which routes produce HTML, JSON and static assets?
- Which pages require D1, other bindings, secrets or a session before rendering?
- Can the initial layout and navigation render without a network response?
- What authenticates API calls, and where is ownership/authorization enforced?
- Does navigation request more server-rendered content? Include nested layouts,
  redirects, framework data requests and mutations, not just the first page.
- Which assets and runtime APIs must be available locally?

Preserve the existing cloud build. Add Vite or esbuild integration only to the
Capacitor build. Do not add a Node HTTP server, replace the native controller,
embed an iframe, or import library-internal transport files into application code.

Choose the smallest integration that preserves the application:

- **Existing frontend calling Worker APIs:** keep that frontend and initialize
  the Fetch-only runtime before mounting it. No rendering migration is required.
- **Worker returning HTML (Hono/TSX, Workers Express, OpenNext):** use native
  document rendering with `render`. Preserve its router and rendering where
  supported.
- **Cloud-dependent requests:** configure remote execution and inspect the build
  report. If local initial display is required, use the migration options below.

## 2. Install Capacitor and this package

Use Capacitor 8 and compatible platform packages. Prepare the platform SDKs using
[Capacitor's installation guide](https://capacitorjs.com/docs/getting-started).
In the application package (reuse its existing Capacitor configuration if any):

```sh
npm install @capacitor/core@8 @capacitor/ios@8 @capacitor/android@8
npm install -D @capacitor/cli@8 vite@7 typescript
npx cap init
```

Set the application's own ID/name and `webDir: "www"`. Use Swift Package Manager
for iOS; this library does not include CocoaPods integration. Until a package
release is available, build and pack this repository with `npm ci`,
`npm run build`, `npm pack`, then install the resulting `.tgz` in the application.
Do not assume an npm release exists. In the application, install the actual file:

```sh
npm install /absolute/path/to/rdlabo-workers-capacitor-0.0.0-poc.1.tgz
```

Keep Capacitor/native projects in the application package, not in the library's
source tree. Reuse existing dependencies and scripts rather than scaffolding a
second application unnecessarily.

## 3. Configure and build the native application

For a Worker-rendered application, add these files alongside the existing Worker:

```text
src/worker.ts             Existing Worker entry
capacitor/index.html     Runtime bootstrap only
capacitor/main.ts        Runtime initialization
capacitor/vite.config.ts Separate native build
capacitor.config.ts      webDir: "www"
```

```html
<!-- capacitor/index.html -->
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Application</title>
  </head>
  <body>
    <script type="module" src="/main.ts"></script>
  </body>
</html>
```

```ts
// capacitor/vite.config.ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { workersCapacitorPlugin } from "@rdlabo/workers-capacitor/tooling/vite";
const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
export default defineConfig({
  root: here("."),
  base: "/",
  plugins: [
    workersCapacitorPlugin({
      worker: here("../src/worker.ts"),
      workerConfig: here("../wrangler.jsonc"),
    }),
  ],
  build: { outDir: here("../www"), emptyOutDir: true, target: "es2022" },
});
```

This example uses Vite. For an existing esbuild build, use the
[esbuild setup](../README.md#esbuild) instead. Do not introduce Vite solely to
replace a supported build. Plain browser ESM is available for browser-compatible
JavaScript, but does not perform the native document asset setup automatically.

Adjust paths to the actual application. For OpenNext the entry is the generated
`.open-next/worker.js`; build it first and explicitly configure remote ASSETS if
used. Additional configuration is described in the [binding guide](cloudflare-bindings.md).

```ts
// capacitor/main.ts — cookie-session example; no app startup side effects
import { workersCapacitor } from "@rdlabo/workers-capacitor";
const runtime = workersCapacitor({
  baseURL: "https://worker.invalid/",
  remote: { origin: "https://your-worker.example.com" },
  render: "/",
});
await runtime.ready;
```

`baseURL` is the logical Worker origin, not a cloud connection by itself.
`remote.origin` identifies the deployed HTTPS Worker. With the generated dispatch,
relative API requests keep their path and selected requests reach that server.
The local app origin is normally `capacitor://localhost` on iOS and
`https://localhost` on Android. See the [URL contract](../README.md#url-contract).

`render` selects native document rendering, including links and forms; it is not
an option specifically for forms. For an already bundled SPA/static App Shell,
omit `render`, initialize the Fetch-only runtime before mounting the UI, and use
an API-only `baseURL` boundary such as `https://your-worker.example.com/api/`.
Keep the shell itself outside that API boundary. The plugin entry must be the
corresponding API Worker; inspect its remote-dispatch report too.

Build and install (add each native platform only once):

```sh
npx vite build --config capacitor/vite.config.ts
npx cap add ios
npx cap add android
npx cap sync
npx cap run ios
# Or: npx cap run android
```

Build before every sync. Document rendering uses bundled assets, not the Vite dev
server. See [native rendering](native-rendering-api.md) for lifecycle and assets.

## 4. Adapt server-dependent behavior when needed

| Existing behavior                       | Migration option                                                                    | Current library boundary                                                            |
| --------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| HTML/TSX without cloud dependencies     | Keep rendering locally; bundle its scripts, styles and images                       | Compatible Fetch handlers can render native documents                               |
| D1 query followed by SSR                | Separate the shell from authenticated JSON reads/writes                             | D1 cannot execute locally; unchanged dependent requests execute remotely            |
| Cookie/session middleware on every page | Make the shell public and fetch private data through protected APIs, if appropriate | Cookie-dependent/shared middleware can keep the whole Worker remote                 |
| Next.js Server Components reading D1    | Move request-time data access behind APIs; keep presentation reusable               | Adding `use client` alone does not create a local application                       |
| Cloud ASSETS routing                    | Decide which assets to package and which stay remote                                | Local ASSETS is not implemented; `assetsExecution: "remote"` retains cloud behavior |

**Remote SSR is a valid integration choice**, with minimal source changes, but it
requires connectivity to generate the page. Do not report it as a local App Shell.
The [OpenNext sample](../demo/opennext/README.md) normally uses this
configuration: D1 and asset-first routing select the whole remote Worker.

For analyzable Hono routes the plugin may separate local pages and remote APIs.
General handlers, Workers Express and generated framework entries can fall back
to whole-Worker remote execution. Inspect `workers-capacitor-d1.json` or
`workers-capacitor-server.json` in the output. A successful build alone does not
prove the shell is local. Do not hide bindings or remove authentication to force
a favorable report. If splitting is unsafe, use an explicit application-owned
shell entry and a separate remote API boundary, or retain remote SSR.

### Preserve SSR when separating cloud data

When a page waits for D1 before producing HTML, local execution cannot preserve
that database access. Keep the request remote for minimum changes, or separate
local rendering from remote data to improve initial display:

```text
Local Worker SSR → HTML display → hydration / client interaction
                                → authenticated remote data → screen update
```

This is the App Shell approach: reuse the Worker's rendering to generate layout,
navigation and initial states on the device without waiting for cloud data. SSR
is useful here; it does not have to run on a remote server. Retain templates and
presentation components rather than rewriting everything as client-only rendering.
Hydration and data requests may overlap. Plain HTML can use small client scripts
without framework hydration.

The library does not automate this application refactor. Use it where it improves
the user experience, not as a prerequisite for every integration. Keep the shell
independent of authentication restoration; show scoped loading, empty, signed-out
and failure states, retain recoverable input and keep navigation responsive.
Do not add generic caching, an offline queue or a new design system for this task.
Local SSR still incurs startup, rendering and hydration costs: measure useful
content and usable controls, not just an earlier spinner. Offline data and writes
remain separate features.

### Hono / TSX

The conceptual change is:

```text
Before: GET /notes → remote authenticate → D1 query → SSR HTML
After:  GET /notes → local Worker SSR → shell HTML + bundled client script
        GET /api/notes → remote authentication → D1 query → JSON
        POST /api/notes → remote authentication/authorization → D1 update
```

Reuse existing API routes when present. Otherwise extract the existing server
operation into a narrow application endpoint; keep SQL, validation and access
control on the Worker. Return only fields needed by the screen, never a generic
SQL or arbitrary binding RPC endpoint. The cloud website can continue SSR using
the same server service and presentation components.

Keep the HTML/TSX rendering route: it now renders the shell using locally
available inputs, with a placeholder for private data. The local shell must not
query D1 or require a server cookie to produce its initial HTML. Its client code fetches data after startup and implements loading,
empty, failure and signed-out states. A failed request must not become an empty
successful result. Cancel obsolete reads during navigation and prevent duplicate
writes. Do not automatically replay mutations after a connection failure.

Package the shell's client JavaScript and CSS as browser assets. Returning TSX
HTML does not automatically bundle client interaction code. Use the existing
framework's client build rather than a second custom renderer.

### Next.js / OpenNext

Hydration attaches interactivity to generated content; it does not remove the
server dependency that produced it. Client Components can be prerendered, and
navigation can need additional RSC payloads. See the official
[Server and Client Components guide](https://nextjs.org/docs/app/getting-started/server-and-client-components).

Start with one screen. Preserve compatible local server rendering of its layout
and initial HTML. Replace its request-time database-derived props with a client
data boundary calling an authenticated API; do not move the entire page into
client-only rendering merely because D1 remains remote. Check parent layouts,
`cookies()`/`headers()`, middleware and Server Actions as well. Preserve server
validation when moving a mutation behind an HTTP endpoint. Reuse display
components without importing database modules into the client graph.

Then choose the build appropriate to that screen:

- A local OpenNext Worker can generate compatible public pages, but cloud
  dependencies may still select whole-Worker remote execution. Follow the
  [OpenNext limitations](opennext.md); this is not automatic Next.js route splitting.
- A separate static shell build can avoid request-time rendering entirely when
  its routes fit [Next.js static export](https://nextjs.org/docs/app/guides/static-exports).
  Dynamic server features need redesign or remote endpoints. This is an
  application migration option, not an integrated Next.js export adapter in this
  package. Test exported paths and reloads in Capacitor; do not assume that copying
  `out/` preserves every routing behavior.

Keep the cloud OpenNext build independent. Do not switch the deployed site's
configuration to static export merely to make the native build pass. Neither
path provides automatic offline data synchronization or full Next.js compatibility.

## 5. Security: the device is not a trusted server

### What the build removes

With the build-generated remote boundary, server handlers and their unused
helpers, including their SQL, are removed from the client module graph before
source maps are generated. Whole-Worker remote mode omits the application
implementation. This is **build-time exclusion**, not deletion of original source
or a runtime SQL sanitizer. See [code removal](d1-transparent-migration.md#code-removal-and-execution-boundaries).

It does not discover every hardcoded secret. Files manually copied to public
assets, `workerFiles`, bundler defines, client `env`, logs and unrelated client
imports can still expose sensitive data. Inspect packaged JS, maps and assets.
Never bypass the removal by importing the original server module separately.

### Authenticate and authorize remote operations

For private data and writes, the Worker must validate a session or bearer token
and authorize each operation. Obtain the user ID from the verified identity,
not an untrusted request field. Scope database queries by the authorized owner
or tenant. Test that user A cannot read or modify user B's records.

CORS, a hidden endpoint, SQL removal, a device-supplied ID and an embedded shared
API key are not authentication. Keep existing authentication if available; this
library transports credentials but does not issue identities or enforce policy.
Public read endpoints can intentionally remain public with appropriate limits.

### Anonymous users when no login UI is needed

For an application without existing authentication, Firebase Anonymous
Authentication is an option for guest identities. It creates a UID without a
signup screen; preserve the existing session instead of creating a new account
at every launch. See [Firebase's anonymous sign-in guide](https://firebase.google.com/docs/auth/web/anonymous-auth).

Connect the initialized host-side auth instance through `remote.getToken`:

```ts
remote: {
  origin: "https://your-worker.example.com",
  getToken: async () => {
    const user = auth.currentUser; // Firebase auth initialized before startup
    if (!user) throw new Error("Authentication required");
    return user.getIdToken(); // Refreshes expired tokens through the SDK
  },
}
```

This is connection pseudocode, not a bundled Firebase adapter. Initialize the
host-side SDK synchronously, then start the local runtime and render the public
shell without awaiting session restoration or network sign-in. Restore the session
asynchronously; only create an anonymous account if restoration finds none.
Gate protected API requests on authentication readiness and show authentication
progress, failure and retry inside the shell. A first launch without connectivity
can show the shell but cannot create a guest account or access protected data.
Keep token retrieval in the host, not in the isolated Worker. In native document
mode the host and rendered page have separate JavaScript contexts: application
code must coordinate authentication state explicitly, without exposing tokens to
the page. Do not assume a page-side Firebase instance is the host instance.
Android may bootstrap the host separately; avoid duplicate sign-in side effects
in the bootstrap. This guide does not supply that application-specific coordination.
The server must verify the signature, expiry, issuer and project audience using
Firebase's [ID token verification requirements](https://firebase.google.com/docs/auth/admin/verify-id-tokens)
and a Workers-compatible verifier; decoding JWT claims alone is insufficient.
Firebase Security Rules do not protect D1: implement authorization in the Worker.

Anonymous identity does not prove a real person, a trusted device or an official
app installation. Anyone may create a guest account. Limit guest privileges,
request rates and costly operations; provide account linking if data must survive
loss of local credentials. Consider [App Check](https://firebase.google.com/docs/app-check)
for abuse protection separately from user authentication. This library does not
supply native attestation or App Check validation.

[Cloudflare Access](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)
is an alternative for access-controlled audiences such as internal applications,
not a drop-in guest identity service. Never embed a shared Access service-token
secret in a distributed app.

### Treat packaged code and data as extractable

Capacitor bundles can be inspected. Do not embed Cloudflare management tokens,
service-account private keys, database credentials or privileged service tokens
in JS, native sources, `.env` values compiled into the app, or bundled files.
Obfuscation does not make a secret safe. Public client identifiers/configuration
are different from server credentials and must not be used as proof of trust.

User credentials need expiration, revocation/logout handling and platform-appropriate
storage. OS-protected storage reduces exposure but does not make a compromised
device trustworthy. Avoid logging tokens and private responses; clear user-scoped
cached data on account changes. The remote Worker must return only data the caller
is allowed to receive.

Native documents have Capacitor plugin access: escape untrusted content and do
not render arbitrary HTML as application code. For cookie authentication retain
CSRF protection. Native forms may omit `Origin`; do not disable CSRF validation
or treat rewritten Origin as proof of trust. External-origin redirects are
rejected; OAuth/SSO requires an explicit external-browser integration. See the
[remote transport boundaries](d1-transparent-migration.md).

## 6. Acceptance checks for the migrated application

Compare the existing flow and the native flow on the same device and data,
with normal connectivity, delayed responses and a disconnected backend. Record
cold launch to usable navigation, time to useful data, and navigation response;
choose acceptance targets appropriate to the application before measuring.
Separate simulator observations from physical-device measurements. Do not claim
an improvement from an HTTP 200 response or an earlier loading indicator alone.

Test an actual application flow on both iOS and Android:

- For a local App Shell, launch with the backend unavailable: navigation and a useful failure
  state still appear. For remote SSR, verify a clear connection failure instead
  of claiming offline startup. Never embed private data in distributed assets.
- Delay or fail data requests: navigation remains usable, loading is scoped to
  content, and failure/retry is distinguishable from an empty result. Restoring
  authentication must not block the public shell or expose private content.
- Fail a submission and navigate back: recoverable input and appropriate screen
  state remain available, duplicate writes are prevented, and success is not
  shown without confirmation. Check keyboard/focus behavior as well.
- Load a deep link, navigate forward/back and reload. Check scripts, styles,
  images, hydration and framework data requests.
- Authenticate, read private data, update once, relaunch, then sign out. Verify
  the database state and that cached data from the previous account is absent.
- Reject missing/expired/forged tokens and cross-user access. Test CSRF for cookie
  mutations. Do not add automatic write retries to mask a failure.
- Inspect the build report and packaged contents: the intended local paths stay local,
  server-dependent paths execute remotely, and excluded server SQL/helpers/secrets are absent.
- Confirm browser/cloud behavior remains intact. Browser CORS/cookie tests do
  not replace native navigation/session tests.

Report the implemented boundary, executed commands, tested platforms and remaining
limitations. State which integration was chosen and why. Do not describe remote SSR as offline support, anonymous identity as
app attestation, or an untested migration recipe as supported framework behavior.
