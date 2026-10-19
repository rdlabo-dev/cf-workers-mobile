# Public HTTPS native acceptance

This opt-in scenario deploys the existing OpenNext demo and D1 to a dedicated Cloudflare test environment. It uses the normal `workers.dev` certificate: no test CA, TLS bypass, local HTTPS server, or tunnel is needed on the phone. Its wrapper adds the existing native driver and a D1-backed report collector without editing application source. The scenario checks hydration, navigation, native plugin replies/events/errors, login, a D1 write, restart, logout and session removal.

The deployment is a test fixture, not an authentication implementation for production. `DEVICE_TOKEN` is a random, temporary bearer credential scoped to this test Worker. `ADMIN_TOKEN` stays on the test host and controls resets and report reads. Neither credential is a Cloudflare API token. All paths, including assets, require authentication; the device credential cannot call the control endpoint. Use a fresh test database and remove the Worker/database and temporary credentials after testing. Never copy the wrapper or its synthetic account into a real application.

## Prepare and deploy

Build `demo/opennext` with its normal `build:worker` command first. Authenticate `cf` to your test account, create a dedicated D1 database, and then run from the repository root:

```sh
NATIVE_TEST_D1_ID=<database-id> node demo/tests/opennext/live/prepare.mjs
cd demo/artifacts/opennext-live
npm install
cf d1 migrations apply <database-id> --dir migrations
cf deploy --secrets-file /absolute/path/to/test-secrets.json
```

The secrets file contains independent random `ADMIN_TOKEN` and `DEVICE_TOKEN` values. Store it outside version control with restricted permissions. Generated build output, configuration and migrations stay in the ignored artifacts directory. The deployment name is `wc-native-opennext-acceptance`; use a dedicated test account to avoid replacing another deployment with that name.

## Run

From the repository root, supply `NATIVE_TEST_ORIGIN` with the deployed HTTPS origin, `NATIVE_TEST_ADMIN_TOKEN` and `NATIVE_TEST_DEVICE_TOKEN` from the secrets file. Pass them through your local environment or secret manager, not checked-in configuration. The admin credential is not exposed through a `VITE_` variable or bundled into the app.

```sh
IOS_PHYSICAL_DEVICE=1 IOS_DEVELOPMENT_TEAM=<team-id> \
OPENNEXT_PLATFORM=ios OPENNEXT_DEVICE=<iPhone-udid> \
node --test demo/tests/opennext/native.test.mjs
```

Keep the paired phone unlocked with Developer Mode enabled. Tests must run serially against this fixture because they intentionally reset its synthetic session and notes. They do not access existing application data. Reports are stored under `demo/artifacts/opennext-native`. The scenario gates functional behavior, not startup or memory performance.

## Public route execution

Set `OPENNEXT_SPLIT=1` on the native command to bundle selected public GET handlers and client assets while keeping the authenticated Worker for all remaining requests. The temporary device token is attached only to remote delivery. The administrative token stays on the host. The Worker stores method/path/RSC evidence in `acceptance_requests`; it does not store Authorization or Cookie headers.

The generated `0002.sql` migration adds that evidence table. Apply both migrations to a fresh test database (or only unapplied migrations to an existing dedicated test database). `NATIVE_TEST_WORKER_NAME` selects a separate test deployment name when preparing the output. Never point the fixture at a production database: its control endpoint deliberately resets synthetic sessions, notes and reports.

Before publishing, prepare with a placeholder D1 ID and run `node --test demo/tests/opennext/live/worker.test.mjs`. This local workerd test verifies unauthenticated rejection, separation of device and admin control privileges, valid device access and credential-free request evidence. It does not itself deploy or certify a production identity provider.
