# Ordinary Android consumer

Requires Gradle 8.14.3, Java 21, Android SDK 36 and an emulator. Run `npm run build` from the repository root first. The shared fixture generates a real `workersAndroid` application with navigation and a POST form.

From this directory:

```sh
node run.mjs emulator-5554
```

The runner uses the repository's Gradle wrapper to publish the SDK into `build/maven`, then builds the consumer without including the SDK source project. Dependencies resolve from the published AAR, POM/Gradle metadata, and Maven Central. Set `JAVA_HOME` to Java 21 and configure `ANDROID_HOME` (or `local.properties`) for your SDK installation.

It asserts Worker navigation, POST, rotation, back/reopen, automatic recovery after startup failure, and recovery after renderer loss. The native screen's visit counter must survive every round trip. Logs and failure snapshots are saved under `build/acceptance/`. The fixture restores emulator rotation settings after the run.

The host remains a ComponentActivity and calls only `WorkersNative.open`. No Capacitor configuration, CLI sync, plugin registration or host superclass changes are needed.

Only one SDK screen may be active per process. A host custom ServiceWorkerController client is unsupported: Android exposes no getter to recover or compare that process-global client. The SDK installs its own route and clears it when its owning screen closes. Cookies are retained.
