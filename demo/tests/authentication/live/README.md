# Public HTTPS OAuth acceptance

This is a synthetic, preauthenticated test issuer deployed to Workers. It verifies system-browser callbacks, one-use authorization codes with S256 PKCE, native token exchange and the existing example Worker's HttpOnly cookie session. It does not verify a production identity provider, account login UI, refresh tokens or cold-start recovery. No test certificate or trust-store change is needed on the phone.

Create a dedicated test D1 database and prepare from the repository root:

```sh
NATIVE_TEST_D1_ID=<database-id> node demo/tests/authentication/live/prepare.mjs
cd demo/artifacts/oauth-live
npm install
cf d1 migrations apply <database-id> --dir migrations
cf deploy --secrets-file /absolute/path/to/oauth-test-secrets.json
```

The secret file contains independent random `ADMIN_TOKEN`, `TEST_CLIENT_ID`, `SESSION_TOKEN` and `COOKIE_SESSION` values. This issuer restricts its synthetic account to the run-specific client ID. That is test isolation, not a replacement for authenticating users in a real identity provider. The device receives only the client ID through OAuth configuration and the access token returned by the normal exchange. The admin token stays on the host. The deployment name is `wc-native-oauth-acceptance`; use a dedicated test account to avoid replacing another deployment with that name. Remove this test Worker, its data and temporary credentials after the run.

From the repository root, supply `NATIVE_TEST_OAUTH_ORIGIN` with the deployed HTTPS origin, `NATIVE_TEST_ADMIN_TOKEN` and `NATIVE_TEST_OAUTH_CLIENT_ID`, then run:

```sh
IOS_PHYSICAL_DEVICE=1 IOS_DEVELOPMENT_TEAM=<team-id> \
UPSTREAM_PLATFORM=ios UPSTREAM_DEVICE=<iPhone-udid> \
node --test demo/tests/authentication/native.test.mjs
```

Keep the paired phone unlocked. Accept the system browser's confirmation to return to Authentication example when prompted. The same test owns its assertions for local and deployed backends. `node --test demo/tests/authentication/live/worker.test.mjs` checks rejection of unauthorized control, incorrect redirects, incorrect PKCE, reused codes and expired codes against workerd/D1 without deploying anything.
