# Independent iOS consumer

This Swift package depends only on the public `WorkersIOS` product and copies its own private web directory into its resource bundle. It has no Capacitor app configuration or plugin registration. `makeEmbeddedController()` works with ordinary UIKit containment; `ConsumerView()` is a SwiftUI host.

First run `npm run build` from the repository root. From this directory:

```sh
node run.mjs <booted-simulator-UUID>
node run.mjs <booted-simulator-UUID> startup-failure
node run.mjs <booted-simulator-UUID> broken-entry
```

The generated resources run a real Worker through `workersIOS`: home, link navigation and a POST form. The same fixture is built for Android. Generated assets are ignored by git. Await `controller.close()` before removing a UIKit controller. SwiftUI dismantling calls close automatically. A closed controller is terminal; construct another controller to reopen.

The runner resolves and builds the independent SwiftPM consumer for the selected Xcode simulator SDK, links an ordinary UIKit executable with its package resource bundle, and asserts Worker content, link navigation, native POST submission, the native disposal hook, idempotent native close, preservation of the host controller, SwiftUI reopening and automatic cleanup on dismantle. The failure scenario asserts automatic cleanup following a rejected startup, without a manual close or host navigation. The broken-entry scenario omits the JavaScript entry and verifies the 30-second ready deadline, cleanup, no late notification after manual close, and no deadline for an undisplayed preloaded controller. Logs are `/private/tmp/workers-ios-acceptance/normal.log` and `startup-failure.log`; `build.log` includes the Swift version, commands, compiler output, and resolved products directory (override the directory using `WORKERS_IOS_PROBE_DIR`). The runner discovers products using `swift build --show-bin-path` and supports native and SwiftBuild layouts. Set `WORKERS_IOS_BUILD_SYSTEM=native` to reproduce older SwiftPM build layouts. This uses debug assertions and an explicit runtime deadline of 120 seconds for normal and 90 seconds for failure scenarios; a failed assertion or missing marker fails the runner. It does not assert WebView deallocation or exercise physical devices.

The normal scenario deliberately keeps the ready Worker visible for 35 seconds before navigation and POST. This verifies that a successful ready handshake cancels the 30-second startup deadline. Its longer outer deadline allows both cold startup and this required survival interval.

In the broken-entry scenario only, closing a host that has not become ready may report the SDK’s five-second JavaScript disposal timeout. The fixture logs this specific `NSURLErrorDomain/-1001` outcome and still requires native child cleanup and suppression of late startup callbacks. Other disposal errors fail acceptance; normal ready-host disposal must succeed.
