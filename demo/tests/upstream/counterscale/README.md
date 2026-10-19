# Counterscale acceptance

`upstream.json` pins the MIT-licensed [Counterscale](https://github.com/benvinegar/counterscale) application. Preparation uses its pnpm lockfile and normal build. The fixture uses Wrangler's programmatic local dev API so the original Worker's Node dependencies receive the same compatibility transforms as its deployment build. No upstream source is edited.

The scenario rejects an incorrect password, accepts the fixture password, reaches the dashboard and verifies the authenticated session through the original home page. The JWT must remain HttpOnly. Without Analytics Engine credentials, the original dashboard renders its configuration error; this is an authentication test, **not successful analytics acceptance**.

The live scenario queries the real Cloudflare Analytics Engine API; a local R2 fixture does not replace that dependency. Do not put the API token in the Capacitor bundle or browser environment.

## Live Analytics Engine scenario

Set `COUNTERSCALE_LIVE_ANALYTICS=1`, `COUNTERSCALE_ACCOUNT_ID`, `COUNTERSCALE_ANALYTICS_TOKEN` and `COUNTERSCALE_TEST_SITE` in the test process environment to select the live scenario. The token needs Account Analytics Read for the test account and is passed only to the backend Worker. Missing settings fail before the backend starts; live mode never falls back to the authentication-only scenario.

The unchanged upstream queries the fixed dataset name `metricsDataset`. Use a test account and a unique site ID matching `wc-acceptance-[a-z0-9-]+`. Seed exactly three page views for that site with hit counts 1, 2 and 3 through the upstream collector, then wait for ingestion and the next five-minute boundary: the upstream queries deliberately exclude the current five-minute bucket. The test verifies the original authenticated stats endpoint returns three views and one visitor, and the dashboard renders the view count. It also retains the incorrect-password and HttpOnly-session assertions. These commands read the seeded events; they do not provision Cloudflare resources or write events automatically.

Keep an Analytics Engine binding for `metricsDataset` in the test account while querying it. A Worker holding only this binding needs no public endpoint. Analytics Engine must be enabled in that account, in addition to the token's read permission. The default CI scenario remains authentication-only and requires no account credentials. Live runs are explicit and depend on Cloudflare availability; they do not turn a failed query into a passing authentication-only result.

```sh
node demo/tests/upstream/counterscale/prepare.mjs
node --test demo/tests/upstream/counterscale/browser.test.mjs
UPSTREAM_PLATFORM=ios UPSTREAM_DEVICE=<simulator-udid> node --test demo/tests/upstream/counterscale/native.test.mjs
UPSTREAM_PLATFORM=android UPSTREAM_DEVICE=<emulator-id> node --test demo/tests/upstream/counterscale/native.test.mjs
```

Native tests forward `WEB_COUNTER_AE` with `remoteBindings` and use the public `workersCapacitor` API. Install root/demo dependencies, build the library and install `demo/opennext` dependencies first. Run tests sharing that shell serially; they reset test app data. Test credentials and local storage are disposable.
