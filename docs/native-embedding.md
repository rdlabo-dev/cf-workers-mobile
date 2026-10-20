# Embed Workers UI in an existing native application

**Release status:** `cf-workers-mobile` is not published to npm yet. The earlier
`workers-capacitor@0.1.1` release does not include these hosts. Use matching
source revisions for the JavaScript package and native SDK as described under
[dependency setup](#dependency-setup). No public Android Maven release is provided yet.

Use these hosts in an existing UIKit, SwiftUI, or Android application without
creating a Capacitor application. The SDK uses Capacitor internally and resolves
it as a native dependency. Your existing application entry point, navigation,
and root screen remain in place.

Choose [iOS](#ios) or [Android](#android) below. For a new Capacitor application or
general native plugins, use the [Capacitor integration](integration.md).

## Shared web build

The Workers application uses the same Worker source, options, and
[Vite/esbuild build configuration](build-setup.md) as cf-workers-mobile. Select
the entry for the target platform:

```ts
import { workersIOS } from "cf-workers-mobile/ios";

const app = workersIOS({
  baseURL: "https://worker.invalid",
  render: "/",
});
await app.ready;
```

For Android, import `workersAndroid` from `cf-workers-mobile/android` with the
same options. Both entries return `ready`, `execution`, `drain()` and `dispose()`.
They also connect native screen closure to disposal in the Worker runtime.
Keep the generated asset directory intact, including the manifests and runtime
chunks. Build web assets in the web project or CI; the native project does not
need npm, `node_modules`, Capacitor CLI commands, or `capacitor.config.*`.

Build a small web entry for each target. For example, use the `workersIOS`
initialization above in `src/main.ts` and this root `index.html`:

```html
<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

Use a separate mobile Vite configuration:

```ts
// vite.mobile.config.ts
import { defineConfig } from "vite";
import { workersCapacitorPlugin } from "cf-workers-mobile/tooling/vite";

export default defineConfig({
  plugins: [workersCapacitorPlugin({ worker: "./src/worker.ts" })],
  build: { outDir: "dist-mobile" },
});
```

Run `npx vite build --config vite.mobile.config.ts` in the web project. The plugin
name remains `workersCapacitorPlugin` for all three hosts. The default execution
policy keeps the Worker remote; replace `https://worker.invalid` with your deployed
Worker origin. Follow the [framework guide](build-setup.md#frameworks) for generated
Worker entries and public assets. Use `workersAndroid` in the Android build's
entry; keep each target's output separate.

Package the **entire** output directory, including `index.html`, into the native
app. Do not point this build at the cloud deployment output or add this plugin to
the Cloudflare build. Local route permissions and remote authentication options
are the same as for [Capacitor](integration.md).
The SDK starts the bundled entry; `render: "/"` selects the initial Worker page.
`ready` reports runtime initialization, not completion of page scripts or images.

## Dependency setup

There is one npm package, `cf-workers-mobile`. Its `/ios`, `/android` and `/capacitor`
entries are subpath imports, not separate npm packages. There is no bare package-root runtime entry. `WorkersIOS` is a SwiftPM product;
`jp.rdlabo:workers-native-android` is an Android Maven artifact.

Create a JavaScript package tarball from a checkout containing these hosts:

```sh
# In the SDK checkout:
npm install
npm pack

# In the web project:
npm install /path/to/cf-workers-mobile/cf-workers-mobile-0.1.1.tgz
```

`npm pack` runs the build through `prepack`; the filename above uses the current
source version. Install the tarball rather than the checkout directory to avoid
a symlink back into the SDK tree, which can create recursive paths for apps inside
that checkout. Use the same Git revision for the iOS Swift package and Android publication. Installing the published
`workers-capacitor@0.1.1` does not provide these entry points.

When migrating from the old npm package, remove the `workers-capacitor` dependency before installing `cf-workers-mobile`; see the [migration steps](integration.md#migrating-from-the-old-npm-package). Keep only the renamed package in the web project.

The native project consumes generated assets and native dependencies only.
The source checkout's npm and build tools belong in the web build or CI.

## iOS

Add `https://github.com/rdlabo-dev/cf-workers-mobile` as a Swift package pinned to
the matching source revision and select the `WorkersIOS` product. Use Xcode 26 /
Swift 6.2 or newer, as required by the native dependency toolchain.
Add your generated assets as a folder resource, for example `WorkerWeb`, then
create the controller from that directory on the main actor:

```swift
import WorkersIOS

let assets = Bundle.main.resourceURL!.appendingPathComponent("WorkerWeb")
let workers = try WorkersViewController(assets: assets)
workers.onStartupError = { message in
    // Show an error in your existing native screen.
    print(message)
}
```

Use normal UIKit child-controller containment or present the controller from
your existing screen. Before removing or dismissing it, await closure:

```swift
try await workers.close()
```

Closure releases resources even when JavaScript disposal fails; report that
error as appropriate in your application. A closed controller is terminal.
Create a new controller when opening the Workers screen again.

For SwiftUI, retain the controller for the view's lifetime and embed
`WorkersView(controller: workers)`. The representable closes its controller
when dismantled. The SDK supplies its own Capacitor configuration and registers
the Workers plugin; your application does not register plugins or replace its
application delegate.

Failed Worker startup releases the embedded runtime and reports `startupError`
and `onStartupError`. The SDK does not pop or replace your native navigation.
When the controller first appears, startup must complete within 30 seconds.
This also detects missing or broken entry scripts that cannot report an error
from JavaScript. Explicit closure cancels the pending startup notification.

## Android

Add the SDK's Android Maven publication to your app's dependencies and include
the generated web directory under `src/main/assets/`, for example `worker-web`.
The publication resolves Capacitor and its other native dependencies. See the
[independent Android consumer](../demo/tests/native-embedding/android/README.md)
for local publication and verification before a release artifact is available.

The Maven coordinate is `jp.rdlabo:workers-native-android:<sdk-version>`. For the
current checkout, generate the local publication from the repository root:

```sh
demo/android/gradlew -p demo/tests/native-embedding/android -PincludeSdk \
  :workers:publishReleasePublicationToProbeRepository
```

Use Java 21 and Android SDK 36, with `ANDROID_HOME` pointing to the installed SDK. Add the resulting
`demo/tests/native-embedding/android/build/maven` directory as a Maven repository
in your app's dependency repositories, alongside Google and Maven Central.
The current local publication uses version `0.1.1`; it is a source-build version,
not evidence of a public Maven release. In your app's Groovy `build.gradle`:

```groovy
dependencies {
    implementation 'jp.rdlabo:workers-native-android:0.1.1'
}
android {
    compileOptions {
        sourceCompatibility JavaVersion.VERSION_21
        targetCompatibility JavaVersion.VERSION_21
    }
    packaging.resources {
        excludes += 'META-INF/INDEX.LIST'
        merges += 'META-INF/io.netty.versions.properties'
    }
}
```

The resource rules combine the native networking dependencies' metadata.
Keep the generated directory at `src/main/assets/worker-web/`, with its
`index.html` directly inside it.

Open the SDK-owned screen from your existing Activity:

```java
import jp.rdlabo.workerscapacitor.WorkersNative;

if (WorkersNative.isSupported()) {
    WorkersNative.open(this, "worker-web");
} else {
    // Show an unsupported-WebView message in your existing native UI.
}
```

The existing Activity can remain a ComponentActivity. The SDK owns its
AppCompatActivity and WebView; the application does not change its superclass,
initialize a Capacitor bridge, or register the Workers plugin.

The installed Android WebView must support AndroidX WebKit `MULTI_PROFILE`.
Check `WorkersNative.isSupported()` before offering the screen on devices where
WebView availability is uncertain. `open()` throws `UnsupportedOperationException`
when this feature is unavailable; updating the device's WebView may enable it.

The SDK uses a dedicated persistent WebView profile for its cookies, storage,
and Service Worker routing. Existing host session cookies, the Java
`CookieHandler`, and the host's Service Worker client remain unchanged. SDK
cookies are separate from host cookies and persist across SDK screen openings.
Capacitor's application-wide core plugins are not registered in this host.

Only one SDK screen can be active at a time. Activity recreation waits for the
previous runtime to release ownership before starting its replacement.
Startup must complete within 30 seconds; failed or incomplete startup closes
the SDK screen and returns to the existing Activity.

## Compatibility

Use matching JS and native SDK revisions. The new hosts share the existing
cf-workers-mobile runtime and build tooling; they do not change Cloudflare
deployment inputs or add a remote Worker deployment.

For general native plugins, use the existing
[Capacitor integration](native-rendering-api.md). These embedding hosts provide
the Workers UI and its runtime connection.

## Verification

Verify an actual user flow in your host app: opening, navigation, form submission,
authentication, closing and reopening. On iOS, exercise UIKit removal or SwiftUI
dismantling; on Android, include rotation and Activity recreation. Confirm that
existing host sessions and WebView flows still work. Android SDK cookies live in
a separate profile, so do not assume a host WebView login transfers to the SDK.
Keep the Worker's existing authentication and authorization; see the shared
[security guidance](integration.md#5-security-the-device-is-not-a-trusted-server).

The independent [iOS consumer](../demo/tests/native-embedding/ios/README.md) and
[Android consumer](../demo/tests/native-embedding/android/README.md) provide
repeatable SDK acceptance checks, including startup failure, missing entry
scripts and healthy operation beyond the startup deadline. These checks cover
simulators/emulators, not physical-device behavior or measured WebView deallocation.
General framework acceptance from the Capacitor demos is not a claim that every
framework flow has also been exercised inside these embedding hosts.
