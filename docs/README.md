# Bring your Workers app to mobile

Bring the app you built with Workers or Void to people who use the web and people who find apps in the store. Start with the integration that fits your app, then connect its existing Workers build.

## Choose your mobile host

| Target        | Guide                                                   | What to expect                                                                                                           |
| ------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **iOS**       | [Embed in UIKit or SwiftUI](native-embedding.md#ios)    | Add the `WorkersIOS` Swift package product and a bundled web build to your existing app.                                 |
| **Android**   | [Embed in an existing app](native-embedding.md#android) | Build the Android SDK artifact locally and open its dedicated screen from an Activity. Requires WebView `MULTI_PROFILE`. |
| **Capacitor** | [Build a mobile app](integration.md)                    | Use a Capacitor app shell and general native plugins, starting from your existing Worker.                                |

The [shared web build](native-embedding.md#shared-web-build) connects the iOS and Android hosts to your Worker. The Capacitor guide includes its own build steps. All three use `cf-workers-mobile@0.1.2`, with a separate mobile build that preserves the Cloudflare deployment inputs.

## Connect your framework

Choose the framework's Worker entry and asset setup before building:

- [Hono](build-setup.md#hono): Fetch handlers and Worker-rendered HTML.
- [Workers Express](build-setup.md#workers-express): Express through the Workers `cloudflare:node` entry.
- [Void React Pages](void.md): generated Worker, React client assets and D1-backed pages.
- [Next.js / OpenNext](opennext.md): generated Worker and client assets, with explicit version and execution limits.
- [Separate frontend](runtime.md#fetch-only-integration): keep your UI and connect its existing API requests.

Use [Vite or esbuild](build-setup.md#tools) for the mobile build. Framework support is scoped to each guide's verified paths; [compatibility](compatibility.md) records the wider API boundaries.

## Understand where your code runs

Start with network execution: requests go to your existing deployed Worker. Bundle public client assets with the app, then select local routes only where your application benefits and the build supports them.

| Question                                                            | Read                                                                                                           |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Which requests stay on Workers, and which can run locally?          | [Execution policies and Cloudflare bindings](cloudflare-bindings.md)                                           |
| How do Worker responses become native WebView pages?                | [Document rendering and native APIs](native-rendering-api.md)                                                  |
| How do I configure initialization, Fetch interception and disposal? | [Runtime reference](runtime.md)                                                                                |
| How do D1-backed requests retain their server boundary?             | [D1 and remote execution](d1-transparent-migration.md)                                                         |
| How do I use other bindings?                                        | [KV](kv.md), [Hyperdrive](hyperdrive-transparent-migration.md), [Service bindings](remote-service-bindings.md) |

## Verify before distribution

Follow the [native embedding verification](native-embedding.md#verification) or [Capacitor acceptance flow](integration.md#6-verify-the-existing-application-in-capacitor). Test navigation, authentication, mutations, lifecycle and network failures in your own app. Simulator/emulator results do not replace checking the devices you intend to support.

Review [security responsibilities](integration.md#5-security-the-device-is-not-a-trusted-server) and [known limitations](compatibility.md). This release is **0.1.2 Preview**; native embedding does not supply general Capacitor plugin integration or automatic store publication.

## Examples and development

[Choose an example](../demo/README.md) to see the relevant integration. To work on the SDK itself, start with [development and tests](development.md) and [contributing](../CONTRIBUTING.md). [Contracts](contracts.md) describes the runtime interfaces; [test execution](test-execution-time.md) explains the CI test groups.
