# Ordinary Android consumer

Requires Gradle 8.14.3, Java 21, Android SDK 36 and an emulator whose WebView supports AndroidX `MULTI_PROFILE`. Run `npm run build` from the repository root first. The shared fixture generates a real `workersAndroid` application with navigation and a POST form.

From this directory:

```sh
node run.mjs emulator-5554
```

The runner uses the repository's Gradle wrapper to publish the SDK into `build/maven`, then builds the consumer without including the SDK source project. Dependencies resolve from the published AAR, POM/Gradle metadata, and Maven Central. Set `JAVA_HOME` to Java 21 and configure `ANDROID_HOME` (or `local.properties`) for your SDK installation.

After a release reaches Maven Central, run `WORKERS_ANDROID_VERSION=0.1.2 node run.mjs emulator-5554 --central`
to verify the released coordinate using the same acceptance checks. This skips
local SDK publication and removes the local Maven repository from dependency
resolution; only Google and Maven Central are used.

It keeps the first healthy Worker screen open beyond the native startup deadline, then asserts Worker navigation, POST, rotation, back/reopen, Activity recreation, automatic recovery after startup failure or a missing JavaScript entry, and recovery after renderer loss. The missing-entry scenario waits for the native startup deadline before returning. The native screen's visit counter must survive every round trip. Logs and failure snapshots are saved under `build/acceptance/`. The fixture restores emulator rotation settings after the run.

The host remains a ComponentActivity and calls only `WorkersNative.open`. No Capacitor configuration, CLI sync, plugin registration or host superclass changes are needed.

Only one SDK screen may be active per process. The SDK uses a separate WebView profile, including its cookie and service-worker routing state. The host installs session and persistent cookies, a process CookieHandler sentinel, and its own ServiceWorkerClient. A separate host WebView registers a real service worker and fetches a sentinel through that client before, during and after SDK use; all host state must survive.

To verify the published JavaScript alongside the Maven SDK, set
`WORKERS_NPM_PACKAGE_DIR` to the absolute path of an installed `cf-workers-native`
package before running with `--central`. The fixture uses that package's runtime
and esbuild plugin instead of local `dist`. Match its source revision to the
Maven artifact using the [dependency matrix](../../../../docs/native-embedding.md#dependency-setup).

## Lifecycle and connection recovery

Start `node ../network-server.mjs` in a separate terminal, then add `--lifecycle`
to the runner invocation. The test sends the app to Home and restores its existing
task by tapping its card in Android Recents, checks the Worker page, then verifies native HTTP
success, a connection closed before response headers, and successful retry.
ADB reverse temporarily exposes loopback port 18764 to the emulator and is removed
after the run. Reserve that port for the fixture. Stop the server after testing.
This models connection loss, not airplane mode or an offline cloud binding.

For published npm 0.1.3, set `WORKERS_ANDROID_VERSION=0.1.2` with `--central` to
select the compatible released Maven artifact. Without an override, local SDK
publication and the consumer follow the repository package version.

`build/acceptance/startup.json` records the selected build configuration and elapsed time including
accessibility polling and tap dispatch; it is not a precise startup benchmark.
`memory-ready.txt` is a `dumpsys meminfo` snapshot of the host application process.
It does not include the entire WebView renderer process tree. Neither measurement
establishes physical-device or production performance.

If UIAutomator exposes an empty WebView hierarchy after navigation, the runner
checks the visible DOM element through WebView debugging and uses its viewport
bounds for the native tap. Each use is logged and `dom-visibility.png` records the
screen. Native host/isolation checks continue to require Android accessibility
nodes. This fallback is functional verification, not an accessibility acceptance.

For a separate Release startup/memory sample, run with
`WORKERS_BUILD_CONFIGURATION=release` and `--measure-only` (without `--lifecycle`).
The fixture signs this local Release APK with its debug key for emulator install;
it does not enable application debugging. This mode checks initial Worker Home,
saves `measurement.png` and the metrics, then closes back to the host. It is not
the full acceptance suite, which requires Debug WebView inspection. Preserve
`build/acceptance/` from the full run before this measurement overwrites its files.

## Investigate Android accessibility separately

`accessibility-run.mjs` distinguishes the rendered DOM from the Android
accessibility tree. A missing accessibility heading is a failure even when its
DOM or screenshot is correct; it never uses the functional runner's DOM fallback
to pass this test.

Build and install the debug-only plain WebView comparator and instrumentation:

```sh
# Run from the repository root with Java 21 and ANDROID_HOME configured.
demo/android/gradlew -p demo/tests/native-embedding/android -PcentralOnly -PsdkVersion=0.1.2 :app:assembleDebug :app:assembleDebugAndroidTest
adb -s emulator-5556 install -r demo/tests/native-embedding/android/app/build/outputs/apk/debug/app-debug.apk
adb -s emulator-5556 install -r demo/tests/native-embedding/android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk

# One persistent UiAutomation connection, native taps, strict accessibility checks.
node demo/tests/native-embedding/android/accessibility-run.mjs emulator-5556 sdk 20 --persistent
node demo/tests/native-embedding/android/accessibility-run.mjs emulator-5556 default 20 --persistent

# A fresh `uiautomator dump` connection at each observation; DOM checked separately.
node demo/tests/native-embedding/android/accessibility-run.mjs emulator-5556 sdk 10
```

Modes are `sdk`, `default` (plain WebView, default profile), and `profile` (plain
WebView, separate profile). The comparator has no Workers bridge or Service Worker.
It is included only in Debug APKs. Each round visits Next and submits a form, so
20 rounds assert 40 transitions. `WORKERS_A11Y_OUTPUT` selects the evidence directory;
the default is `artifacts/android-accessibility/<connection>-<mode>` relative to the
current directory. The runner validates the instrumentation result rather than
trusting `am instrument`'s shell exit status. Failure evidence includes the native
tree, visible DOM and screenshot. DOM capture is diagnostic, never a success oracle.

### WebView provider requirements for verification

Record the provider version with every run (`webview.txt`). WebView 134.0.6998.135
can expose an empty native accessibility tree even in the plain WebView comparator.
Use the verified 155.0.8059.43 provider to reproduce this environment's acceptance.
Updating the verification environment resolved the observed failure; this does not
introduce a new SDK minimum WebView version or certify TalkBack. Android remains
in the verification scope. If the failure recurs on the verified provider, compare
plain WebView and SDK results before attributing it to the SDK.

Keep run results and investigation evidence in the pull request and generated
artifacts, as required by the repository's contribution guidelines.
