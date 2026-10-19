# UptimeFlare acceptance

`upstream.json` pins the Apache-2.0-licensed [UptimeFlare](https://github.com/lyc8503/UptimeFlare) source. Preparation installs the upstream lockfile and runs its normal build in an ignored checkout without source edits.

It seeds monitor status and latency history in real local workerd D1, verifies the original status page, follows its Incidents link and selects a monitor filter. This exercises Next.js Pages Router hydration and navigation. Scheduled monitoring, external probes and notifications are outside this scenario.

Native tests use the public `workersCapacitor` API with remote Worker execution over local HTTPS. The original pages run in the Capacitor WebView. A fixture-only driver is injected into HTML; this does not establish offline support. The fixture loads all modules from the original next-on-pages output, including dynamically imported route modules. The fixture configuration describes its D1 and static assets; application source is unchanged.

```sh
node demo/tests/upstream/uptimeflare/prepare.mjs
node --test demo/tests/upstream/uptimeflare/browser.test.mjs
UPSTREAM_PLATFORM=ios UPSTREAM_DEVICE=<simulator-udid> node --test demo/tests/upstream/uptimeflare/native.test.mjs
UPSTREAM_PLATFORM=android UPSTREAM_DEVICE=<emulator-id> node --test demo/tests/upstream/uptimeflare/native.test.mjs
```

Install root/demo dependencies and build the library first; native tests also need `demo/opennext` dependencies. Run tests sharing that native shell serially. Each run resets the test app's data.
