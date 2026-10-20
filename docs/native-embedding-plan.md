# Minimal native embedding plan

Status: proposed implementation, with local feasibility probes completed on
2026-10-20. This document does not announce released SDKs or new public exports.

## Decision: thin wrappers over Capacitor and workers-capacitor

Build workers-ios and workers-android as thin integration layers over Capacitor
itself and the existing workers-capacitor implementation. Direct dependencies on
`@capacitor/ios`, `@capacitor/android`, or their SwiftPM/Maven distributions are
part of the design. Capacitor can appear in dependency graphs, setup documentation,
and native types where useful; hiding the dependency is not a product requirement.

Capacitor is [MIT licensed](https://github.com/ionic-team/capacitor/blob/8.5.3/LICENSE).
Use its existing host, bridge, WebView configuration, and asset server directly,
and preserve its copyright and license notices in distributions. No replacement
WebView framework or generic embedding framework is needed.

The product is a Workers web UI that an existing native application can embed or
open. Applications wanting the full Capacitor plugin workflow can continue using
workers-capacitor. The new wrappers only connect that same Workers implementation
to an existing native application.

## Reuse and additional code

| Layer                | Reuse                                                                                                                         | Small addition                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Native web host      | Capacitor's existing iOS controller and Android bridge                                                                        | Host composition, generated asset location, and Workers plugin registration                   |
| Workers behavior     | workers-capacitor execution, compatibility APIs, document rendering, network/socket bridges, routing, and local/remote policy | No separate runtime                                                                           |
| JS application entry | Existing options and application handle                                                                                       | `workersIOS(options)` / `workersAndroid(options)` wrappers and private lifecycle registration |
| Build                | Existing Vite/esbuild plugins and generated assets                                                                            | Native resource placement and dependency packaging                                            |
| Shutdown             | Existing application disposal and native cleanup                                                                              | Connect native screen closure and failure rollback to the owning runtime                      |

Keep the existing workers-capacitor API and Cloudflare builds unchanged. Use the
same sources rather than extracting a new core package or copying the runtime
into platform forks. Exact public export paths remain an implementation choice.

## Consumer workflow

1. Build the existing Worker application with the existing tooling and options.
   Select `workersIOS(options)` or `workersAndroid(options)` in the application
   entry instead of `workersCapacitor(options)`.
2. Add the native wrapper and its Capacitor dependencies through SwiftPM or Gradle,
   and include the generated web assets in the native application.
3. Embed or open the provided host from the application's existing UI.

The wrapper supplies the required Capacitor configuration and Workers plugin
registration. Consumers do not need a separate Capacitor application project,
Capacitor CLI synchronization, or duplicate Worker configuration in Swift/Kotlin.
Normal native dependency and resource setup is expected; eliminating visible
Capacitor dependencies must not introduce extra abstraction or custom packaging.

Ionic Portals illustrates this embedding model, but is not required. Its
[installation guide](https://ionic.io/docs/portals/for-android/guide) requires an
active commercial agreement, and Ionic
[ended new commercial sales including Portals](https://ionic.io/blog/important-announcement-the-future-of-ionics-commercial-products).
Use the MIT-licensed Capacitor host directly. Portals integration with the Workers
plugin has not been runtime-tested.

## Native hosts

### iOS

Compose or minimally subclass `CAPBridgeViewController` with the current Workers
plugin, and expose it for embedding in an existing UIKit controller. Add only a
thin SwiftUI representable. Reuse Capacitor initialization and view handling;
do not implement a separate iOS WebView host.

Pass the private asset/configuration descriptor through the document-controller
factory and plugin startup path. Preserve the current descriptor fallback for
existing Capacitor applications. The SDK host must not take ownership of the
application's notification delegate.

Distribute through SwiftPM. Validate resource resolution from a separate consumer
application; the local probe used a private asset directory, not a finished
SwiftPM distribution.

### Android

Reuse Capacitor's `Bridge.Builder` inside a thin Fragment/Activity adapter.
The baseline is a wrapper-owned AppCompatActivity that any existing Activity can
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
2. **Connect existing Capacitor hosts.** Add the thin iOS controller and Android
   screen adapters, Workers plugin registration, asset selection, orderly
   shutdown, and failure rollback. Reuse Capacitor host behavior directly.
   Verify navigation, POST, close/reopen, pending network cancellation, startup
   failure, renderer loss, overlap rejection, and release of retained resources.
3. **Distribution and independent consumers.** Package SwiftPM and Maven products,
   including resources, normal Capacitor dependencies, license notices, manifest
   and shrinker requirements. Build separate native consumer applications using
   native dependency/resource setup and no Capacitor CLI steps. Exercise the same Worker UI and verify existing Capacitor behavior and
   Cloudflare build isolation.

Reuse existing contract fixtures and assertions across hosts. Add tests only for
new embedding, ownership, lifecycle, and distribution boundaries; do not copy the
full compatibility suite three times. Each implementation stage requires review,
correction of findings, and acceptance before release.
