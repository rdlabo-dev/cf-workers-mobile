# Independent iOS consumer

This Swift package depends only on the public `WorkersIOS` product and copies its own private web directory into its resource bundle. It has no Capacitor app configuration or plugin registration. `makeEmbeddedController()` works with ordinary UIKit containment; `ConsumerView()` is a SwiftUI host.

First run `npm run build` from the repository root. From this directory:

```sh
node run.mjs <booted-simulator-UUID>
node run.mjs <booted-simulator-UUID> startup-failure
```

The generated resources run a real Worker through `workersIOS`: home, link navigation and a POST form. The same fixture is built for Android. Generated assets are ignored by git. Await `controller.close()` before removing a UIKit controller. SwiftUI dismantling calls close automatically. A closed controller is terminal; construct another controller to reopen.

The runner resolves and builds the independent SwiftPM consumer for the selected Xcode simulator SDK, links an ordinary UIKit executable with its package resource bundle, and asserts Worker content, link navigation, native POST submission, the native disposal hook, idempotent native close, preservation of the host controller, SwiftUI reopening and automatic cleanup on dismantle. The failure scenario asserts automatic cleanup following a rejected startup, without a manual close or host navigation. Logs are `/private/tmp/workers-ios-acceptance/normal.log` and `startup-failure.log`; `build.log` includes the Swift version, commands, compiler output, and resolved products directory (override the directory using `WORKERS_IOS_PROBE_DIR`). The runner discovers products using `swift build --show-bin-path` and supports native and SwiftBuild layouts. Set `WORKERS_IOS_BUILD_SYSTEM=native` to reproduce older SwiftPM build layouts. This uses debug assertions and an explicit 90-second runtime deadline; a failed assertion or missing marker fails the runner. It does not assert WebView deallocation or exercise physical devices.
