# microfeed acceptance

`upstream.json` pins the AGPL-3.0-licensed [microfeed](https://github.com/microfeed/microfeed) source. Preparation installs the upstream lockfile and runs its normal build in an ignored checkout without source edits.

It seeds a published article in real local workerd D1, opens it from the original feed and reads the RSS feed. Both the article body and RSS title are asserted. R2 and Queue bindings are local workerd services. Administration, media upload, subscriptions, webhook delivery and production Cloudflare resources are outside this scenario.

Native tests use the public `workersCapacitor` API with remote Worker execution over local HTTPS. The original pages run in the Capacitor WebView. A fixture-only driver is injected into HTML; this does not establish offline support. The native configuration forwards `CF_VERSION_METADATA` with `remoteBindings`. Its `baseURL` matches the Worker origin so absolute article links remain inside the app.

```sh
node demo/tests/upstream/microfeed/prepare.mjs
node --test demo/tests/upstream/microfeed/browser.test.mjs
UPSTREAM_PLATFORM=ios UPSTREAM_DEVICE=<simulator-udid> node --test demo/tests/upstream/microfeed/native.test.mjs
UPSTREAM_PLATFORM=android UPSTREAM_DEVICE=<emulator-id> node --test demo/tests/upstream/microfeed/native.test.mjs
```

Install root/demo dependencies and build the library first; native tests also need `demo/opennext` dependencies. Run tests sharing that native shell serially. Each run resets the test app's data.
