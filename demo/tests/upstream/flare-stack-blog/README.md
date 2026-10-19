# flare-stack-blog acceptance

`upstream.json` pins the GPL-3.0-only-licensed [flare-stack-blog](https://github.com/du2333/flare-stack-blog) source. Preparation installs the upstream lockfile and runs its normal build in an ignored checkout without source edits.

It applies the original migrations to local workerd D1, seeds a published article, verifies navbar CSS and the client-side navigation menu, follows its original list link and verifies the article body. Script/stylesheet failures fail the scenario. The pinned original Worker can emit React #418 when server and client locale selection differ; this recoverable baseline mismatch is recorded separately, and functional hydration is still required. R2, KV, Queue and SQLite Durable Objects use local workerd services. Authoring, OAuth, email, scheduled jobs and production Cloudflare resources are outside this scenario.

Native tests use the public `workersCapacitor` API with remote Worker execution over local HTTPS. The original pages run in the Capacitor WebView. A fixture-only driver is injected into HTML; this does not establish offline support. The native configuration keeps KV remote. The fixture configuration describes the original cf build output and bindings; application source is unchanged.

### iOS limitation

The unchanged application passes this scenario on Android, but fails on iOS. Its `createAuthClient()` call omits `baseURL`, so Better Auth derives it from `window.location.origin` and rejects `capacitor://localhost` with `BetterAuthError: Invalid base URL`. The HTML and assets load, but client initialization stops and the navigation menu cannot open. SSR output alone is not acceptance. The iOS test deliberately retains the same functional assertions and fails until this boundary is resolved.

An explicit HTTPS authentication base URL is a possible application configuration change, but its session, cookie and request routing behavior has not been validated here. This fixture does not patch the original application, rewrite Better Auth, or spoof the WebView origin.

```sh
node demo/tests/upstream/flare-stack-blog/prepare.mjs
node --test demo/tests/upstream/flare-stack-blog/browser.test.mjs
UPSTREAM_PLATFORM=ios UPSTREAM_DEVICE=<simulator-udid> node --test demo/tests/upstream/flare-stack-blog/native.test.mjs
UPSTREAM_PLATFORM=android UPSTREAM_DEVICE=<emulator-id> node --test demo/tests/upstream/flare-stack-blog/native.test.mjs
```

Install root/demo dependencies and build the library first; native tests also need `demo/opennext` dependencies. Run tests sharing that native shell serially. Each run resets the test app's data.
