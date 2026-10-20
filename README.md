# cf-workers-mobile

**Bring the app you built with Workers or Void to iOS and Android.**

Reach people who prefer the browser and people who look for apps in the store. Offer a mobile app alongside your web app, so your users can choose the platform that works for them.

## Choose how to bring your app to mobile

- **Embed in an existing iOS app**
  Add a Workers-powered screen to your UIKit or SwiftUI app. [iOS guide](docs/native-embedding.md#ios).
- **Embed in an existing Android app**
  Add a Workers-powered screen to your existing Android app. [Android guide](docs/native-embedding.md#android).
- **Create a new mobile app**
  Use Capacitor to build an iOS and Android app for distribution through the App Store and Google Play. [Capacitor guide](docs/integration.md).

[Documentation](docs/README.md) · [Examples](demo/README.md) · [0.1.2 Preview release](https://github.com/rdlabo-dev/cf-workers-mobile/releases/tag/v0.1.2)

## Keep building the app you know

- **Reuse your pages and flows.** Bring Worker-rendered HTML, links and forms into a mobile WebView. Keep the application's existing rendering model; an SPA rewrite is not a prerequisite.
- **Give your app a mobile home.** Create an iOS and Android app with Capacitor, or bring your Workers pages into a native app you already have.
- **Keep your backend on Workers.** D1, server secrets and cloud-dependent logic stay on the deployed Worker. The separate mobile build leaves your Cloudflare deployment inputs unchanged.
- **Choose what runs on the device.** Start with the default network execution. Where supported, explicitly select public routes for local execution and bundle client assets with the app.

Local execution has [compatibility limits](docs/compatibility.md). Cloud-backed pages still need a connection; bundling their client assets does not make them offline applications.

## Start from your framework

| Workers application    | What you can bring                                                                   | Guide                                                |
| ---------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| **Hono**               | Fetch handlers and HTML pages, including links and forms                             | [Hono setup](docs/build-setup.md#hono)               |
| **Workers Express**    | API handlers and HTML responses using the Workers entry                              | [Express setup](docs/build-setup.md#workers-express) |
| **Void React Pages**   | Worker-rendered pages, hydration and D1-backed forms                                 | [Void setup](docs/void.md)                           |
| **Next.js / OpenNext** | Pages backed by the deployed Worker, with local route selection for supported builds | [OpenNext setup](docs/opennext.md)                   |

Each guide describes its tested versions and boundaries. Already have a separate frontend calling Worker APIs? Keep that frontend and use the [Fetch-only integration](docs/runtime.md#fetch-only-integration).

## Get your app onto your phone

Install the shared JavaScript package in your web project:

```sh
npm install cf-workers-mobile@0.1.2
```

The mobile entry selects the host. For example, an iOS web entry starts with:

```ts
import { workersIOS } from "cf-workers-mobile/ios";

const app = workersIOS({
  baseURL: "https://your-worker.example.com/",
  render: "/",
});
await app.ready;
```

Use `workersAndroid` from `cf-workers-mobile/android` or `workersCapacitor` from `cf-workers-mobile/capacitor` for the other hosts. All three share the same runtime options and [Vite/esbuild tooling](docs/build-setup.md).

This entry is one part of the setup: connect the existing Worker to a **separate mobile build**, then package its output with your chosen native host. The [embedding guide](docs/native-embedding.md) and [Capacitor guide](docs/integration.md) cover the complete path. For an existing native app, build the web assets in the web project or CI; the native project does not need Capacitor CLI commands or configuration.

**0.1.2 is a Preview.** APIs may change. Android embedding currently requires WebView `MULTI_PROFILE` support and a locally built SDK artifact; a public Maven release is not yet available. Read the [native requirements](docs/native-embedding.md#dependency-setup) before integrating. Upgrading from `workers-capacitor`? Follow the [migration steps](docs/integration.md#migrating-from-the-old-npm-package).

## Build with your AI assistant

Open your application repository and give your assistant this prompt, replacing the target with **iOS**, **Android** or **Capacitor**:

```text
Read https://github.com/rdlabo-dev/cf-workers-mobile/blob/v0.1.2/README.md
and the integration guide for our target: <iOS, Android or Capacitor>.
Bring this Workers application to that target using cf-workers-mobile@0.1.2.
Preserve its pages, routes, authentication and Cloudflare deployment configuration.
For an existing native app, preserve its entry point and navigation.
Verify the actual user flows on the target platform and report remaining limits.
```

## Make it ready for your users

Follow a real flow from launch to sign-out: load a page, navigate, submit a form, reopen the app and check what happens when the network is unavailable. Keep secrets on the Worker and enforce authentication and authorization there. The [integration checklist](docs/integration.md#6-verify-the-existing-application-in-capacitor) and [native embedding checks](docs/native-embedding.md#verification) explain what to verify.

For an existing native app, use its release workflow. For Capacitor, continue with [safe areas and native plugins](docs/native-rendering-api.md). Store submission and review remain part of your application's release process.

## Explore and contribute

[Documentation](docs/README.md) · [Examples](demo/README.md) · [Compatibility](docs/compatibility.md) · [Development](docs/development.md) · [Contributing](CONTRIBUTING.md)

## License

[MIT](LICENSE).
