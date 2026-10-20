# Embed Workers UI in an existing native application

These hosts are not included in release 0.1.1. Until the next release, use the
same implementation revision for JS and native dependencies, and the local
publication instructions in the consumer fixtures.

Use these hosts in an existing UIKit, SwiftUI, or Android application without
creating a Capacitor application. The SDK uses Capacitor internally and resolves
it as a native dependency. Your existing application entry point, navigation,
and root screen remain in place.

The Workers application uses the same Worker source, options, and
[Vite/esbuild build configuration](build-setup.md) as workers-capacitor. Select
the entry for the target platform:

```ts
import { workersIOS } from "workers-capacitor/ios";

const app = workersIOS({
  baseURL: "https://worker.invalid",
  render: "/",
});
await app.ready;
```

For Android, import `workersAndroid` from `workers-capacitor/android` with the
same options. Both entries return `ready`, `execution`, `drain()` and `dispose()`.
They also connect native screen closure to disposal in the Worker runtime.
Keep the generated asset directory intact, including the manifests and runtime
chunks. Build web assets in the web project or CI; the native project does not
need npm, `node_modules`, Capacitor CLI commands, or `capacitor.config.*`.

## iOS

Add the repository as a Swift package and select the `WorkersIOS` product.
Add your generated assets as a folder resource, for example `WorkerWeb`, then
create the controller from that directory:

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

## Android

Add the SDK's Android Maven publication to your app's dependencies and include
the generated web directory under `src/main/assets/`, for example `worker-web`.
The publication resolves Capacitor and its other native dependencies. See the
independent consumer fixture under `demo/tests/native-embedding/` for local
publication and verification before a release artifact is available.

The Maven coordinate is `jp.rdlabo:workers-native-android:<sdk-version>`.

Open the SDK-owned screen from your existing Activity:

```java
import jp.rdlabo.workerscapacitor.WorkersNative;

WorkersNative.open(this, "worker-web");
```

The existing Activity can remain a ComponentActivity. The SDK owns its
AppCompatActivity and WebView; the application does not change its superclass,
initialize a Capacitor bridge, or register the Workers plugin.

Only one SDK screen can be active per process. This host uses Android's
process-global Service Worker client, so applications that install their own
custom Service Worker client are not supported. Do not replace that client while
the SDK is active. Cookie storage is preserved when the SDK closes.

## Compatibility

Use matching JS and native SDK revisions. The new hosts share the existing
workers-capacitor runtime and build tooling; they do not change Cloudflare
deployment inputs or add a remote Worker deployment.

For general native plugins, use the existing
[Capacitor integration](native-rendering-api.md). These embedding hosts provide
the Workers UI and its runtime connection.
