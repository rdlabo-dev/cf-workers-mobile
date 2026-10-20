# Minimal native embedding plan

Status: proposed implementation, with local feasibility probes completed on
2026-10-20. This document does not announce released SDKs or new public exports.

## Goal and reuse boundary

Let existing iOS and Android applications display a Workers application's web UI
using the runtime already provided by workers-capacitor. Applications needing
general native plugins should use the existing Capacitor integration.

Keep one implementation of Worker execution, compatibility APIs, network and
socket bridges, document rendering, routing, and local/remote execution policy.
Reuse the existing Vite/esbuild plugins and their generated assets. Do not create
a second engine, a native Worker invocation API, or three runtime forks.
Existing workers-capacitor behavior and Cloudflare builds must remain unchanged.

Provide thin `workersIOS(options)` and `workersAndroid(options)` entries with the
same options and returned application handle as `workersCapacitor(options)`.
Exact package/export paths will be chosen during implementation. These wrappers
also register the handle with a private SDK lifecycle hook; a literal alias alone
cannot support native-initiated disposal.

Native consumers add the SDK dependency, include the generated web assets, and
place or open its screen. They do not configure Capacitor, register its plugins,
run the Capacitor CLI, or repeat Worker configuration in Swift/Kotlin. Internal
Capacitor dependencies remain pinned and managed by the SDK.

## Native hosts

### iOS

Expose a Workers view controller that can be embedded in an existing UIKit
controller, with a thin SwiftUI representable. Internally reuse
`CAPBridgeViewController` and the current native plugin.

Pass the private asset/configuration descriptor through the document-controller
factory and plugin startup path. Preserve the current descriptor fallback for
existing Capacitor applications. The SDK host must not take ownership of the
application's notification delegate.

Distribute through SwiftPM. Validate resource resolution from a separate consumer
application; the local probe used a private asset directory, not a finished
SwiftPM distribution.

### Android

The baseline is an SDK-owned AppCompatActivity that any existing Activity can
open. Inline Fragment embedding is supported only in an AppCompatActivity host:
Capacitor 8.5.3's Fragment bridge builder requires that concrete activity type.
Arbitrary ComponentActivity inline embedding is outside the initial scope.

Keep the existing hidden runtime WebView and document Service Worker mechanism.
Disabling Service Worker request resolution failed the rendering probe.

Distribute an SDK Maven publication with transitive native dependencies, including
the official `com.capacitorjs:core:8.5.3` artifact. Consumers should not need
`node_modules` or a `project(':capacitor-android')` dependency in their native
project. The artifact exists in the
[official Maven repository](https://repo.maven.apache.org/maven2/com/capacitorjs/core/8.5.3/core-8.5.3.pom);
the SDK publication itself still needs independent-consumer validation.

## Lifecycle and initial support limits

Android's Service Worker client is process-global and retains the bridge.
Destroying a WebView or successfully reopening the screen does not prove cleanup.
The initial SDK contract allows one active SDK runtime per process and excludes
hosts with their own process-global Service Worker client. There is no public
getter with which to preserve and restore an unknown existing client.

The SDK must:

- Reject overlapping runtimes before constructing another bridge.
- Send orderly disposal to the private realm that owns the Worker, including the
  hidden runtime on Android, and await completion before destroying native views.
- Release document dispatch, owned Service Worker registration, sockets, and
  native resources; clear the process-global client only under SDK ownership.
- Apply the same ownership rollback to startup failures. Handle renderer loss or
  failed JavaScript disposal with native cleanup without claiming JS completion.
- Preserve the application's cookie store and avoid unrelated URL interception.

Concurrent external replacement of the global client is unsupported. Do not add
process isolation, a Capacitor fork, or another rendering engine to broaden this
first release.

## Feasibility evidence

The probes used existing runtime/build output and Capacitor 8.5.3. They were
temporary local experiments, not checked-in SDK implementations or reproducible
release acceptance suites.

| Probe                | Observed result                                                                                                           | Remaining boundary                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| iOS simulator        | Existing UIKit parent retained; private assets loaded; Worker HTML, link navigation, JS disposal, and reopening passed    | SwiftUI wrapper compiled but was not exercised; packaged SDK and native-triggered complete cleanup remain unverified |
| Android emulator     | ComponentActivity launched SDK-owned screen; Worker HTML, navigation, POST form, detach/reopen, and return to host passed | Reopening did not verify JS disposal, global-client release, or absence of retained Activity resources               |
| JS configuration     | Aliased entries accepted the same options and preserved the runtime handle behavior                                       | Private lifecycle registration still needs implementation                                                            |
| Build reuse          | Existing esbuild output for the original entry and both aliases produced five byte-identical files                        | Actual exported wrappers and packaged assets need regression coverage                                                |
| Cloudflare isolation | Existing build-isolation suite passed all 12 tests                                                                        | Preserve these guards when implementing and packaging the SDKs                                                       |

No physical-device or finished SDK distribution acceptance is claimed.

## Implementation sequence and acceptance

1. **Thin entries and lifecycle connection.** Add the platform entries and private
   handle registration. Add the two iOS descriptor-passing seams while preserving
   the existing Capacitor fallback. Verify options/return compatibility and
   disposal in the actual runtime realm.
2. **Native hosts and ownership.** Implement the iOS controller and Android screen,
   internal plugin setup, asset loading, orderly shutdown, and failure rollback.
   Verify navigation, POST, close/reopen, pending network cancellation, startup
   failure, renderer loss, overlap rejection, and release of retained resources.
3. **Distribution and independent consumers.** Package SwiftPM and Maven products,
   including resources, dependencies, manifest and shrinker requirements. Build
   separate native consumer applications without Capacitor configuration or CLI
   steps. Exercise the same Worker UI and verify existing Capacitor behavior and
   Cloudflare build isolation.

Reuse existing contract fixtures and assertions across hosts. Add tests only for
new embedding, ownership, lifecycle, and distribution boundaries; do not copy the
full compatibility suite three times. Each implementation stage requires review,
correction of findings, and acceptance before release.
