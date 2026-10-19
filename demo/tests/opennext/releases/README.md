# Old installed app / updated Worker acceptance

This fixture builds independent releases A and B from the OpenNext sample. Build IDs, the rendered `data-release` marker, a real client component chunk and generated Next keys differ. The HTTP API, schema and form contracts remain compatible. Original application sources are not modified. Dependency copies preserve the installed versions and avoid sharing OpenNext's traced dependency graph between releases.

From the repository root:

```sh
node demo/tests/opennext/releases/prepare.mjs
OPENNEXT_PLATFORM=ios OPENNEXT_DEVICE=<simulator-UUID> node demo/tests/opennext/releases/native.mjs
OPENNEXT_PLATFORM=android OPENNEXT_DEVICE=<emulator-serial> node demo/tests/opennext/releases/native.mjs
```

Run platforms serially because they share the native shell. This scenario uses local HTTPS/workerd and does not deploy anything; omit `NATIVE_TEST_ORIGIN`. Preparation replaces only the generated `demo/artifacts/opennext-releases/A` and `B` directories.

The app bundles A's client assets and permitted public GET implementations, while remote requests execute B's Worker. Acceptance checks the A marker during local hydration and the B marker after a remote form round trip. It also checks public SSR/API isolation, remote RSC navigation, CSRF rejection without a D1 write, a successful write, session persistence across app restart, expired-session rejection, logout and native plugin replies/events/errors. Logs and reports are written to `demo/artifacts/opennext-releases/native/`.

This proves the sample's compatible HTTP/form rollout, not arbitrary Next version compatibility. Changed API/schema contracts, retained Server Action closures, middleware changes, renamed routes and missing remote historical assets require their own migration policy. Local route execution does not make those changes backward compatible.
