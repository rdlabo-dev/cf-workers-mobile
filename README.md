# cf-workers-mobile

Bring Cloudflare Workers apps to iOS and Android.

cf-workers-mobile brings existing Cloudflare Workers applications into iOS, Android and Capacitor applications, so you can reuse your pages, routes and application logic with minimal changes. Your web application stays on Workers, with a mobile version you can prepare for distribution through the App Store and Google Play.

[Void 1.1.12](https://github.com/voidzero-dev/void/releases/tag/v1.1.12) adds Capacitor iOS navigation support! With this update, you can bring your Void app to iOS and Android using cf-workers-mobile. [Get started with Void](docs/void.md).

## Get your app onto your phone

Choose the host that matches your application:

| Host                                                           | Start here                                                | Application entry                                     |
| -------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------- |
| iOS: existing UIKit or SwiftUI app                             | [Embed a Workers screen](docs/native-embedding.md#ios)    | `workersIOS` from `cf-workers-mobile/ios`             |
| Android: existing native app                                   | [Open a Workers screen](docs/native-embedding.md#android) | `workersAndroid` from `cf-workers-mobile/android`     |
| Capacitor: a new mobile app, or an app using Capacitor plugins | [Integrate your Workers app](docs/integration.md)         | `workersCapacitor` from `cf-workers-mobile/capacitor` |

All three JavaScript entries belong to the single npm package `cf-workers-mobile`; `/ios`, `/android` and `/capacitor` are subpath imports; there is no bare package-root runtime entry.

The iOS and Android hosts use Capacitor internally. Your existing native app does not need Capacitor configuration, CLI commands or plugin registration. They share the same Worker source, runtime options and [build tooling](docs/build-setup.md). Use the Capacitor integration when you need general native plugins.

**Release status:** 0.1.2 Preview introduces the `cf-workers-mobile` npm name and the iOS, Android and Capacitor entries. Once the release is published, install `cf-workers-mobile@0.1.2`. The earlier `workers-capacitor@0.1.1` Preview does not include the embedding hosts or renamed imports. See [dependency setup](docs/native-embedding.md#dependency-setup) and the [compatibility limits](docs/compatibility.md); APIs may change before a stable release.

If you use an AI coding assistant, open your application repository and give it the guide for your chosen host. For an existing native app:

```text
Follow docs/native-embedding.md from the cf-workers-mobile revision being used
to embed this Workers app in our existing iOS or Android application.
Preserve the native entry point, navigation and existing host state.
Reuse the Workers pages, routes and authentication; verify on the target platform.
```

For Capacitor, use the [integration prompt](docs/integration.md#prompt-to-give-your-ai-assistant).

Then select the framework guide for the Workers application:

- [Void React Pages + D1](docs/void.md)
- [Hono and Workers Express](docs/build-setup.md#frameworks)
- [Next.js / OpenNext](docs/opennext.md)

## Keep building the app you know

Keep working with your existing pages, forms and routes. The iOS and Android hosts display them inside your existing native app. [Capacitor](https://capacitorjs.com/) provides the app shell when you are starting a mobile app or need its plugin ecosystem.

Your database can stay where it is. Requests that need D1 or other cloud services run on your existing deployed Worker, while supported code can run on the device. See [build setup](docs/build-setup.md) and [execution policies](docs/cloudflare-bindings.md) when you need the details.

If you already have a separate frontend, keep its existing API calls with the [Fetch-only integration](docs/runtime.md#fetch-only-integration).

## Next steps

For an existing iOS or Android app, keep its icons, navigation and release workflow. Follow the [embedding lifecycle and verification guidance](docs/native-embedding.md#verification) before shipping.

For a Capacitor app, make it your own one step at a time:

1. Make your app easy to recognize on the home screen and when it opens. Add your own icon and splash screen with [Capacitor's asset guide](https://capacitorjs.com/docs/guides/splash-screens-and-icons), then rebuild and run the app again to see your changes.
2. Make the screen comfortable to use. Check that buttons stay clear of the notch and home indicator; adjust [iOS Safe Area](docs/native-rendering-api.md#ios-safe-area) if needed.
3. Let users take a photo, share content or get haptic feedback after an action. Pick one feature that suits your app and add it with a [Capacitor plugin](docs/native-rendering-api.md#native-plugins).
4. When repeated builds and store uploads start taking time, [Capawesome Cloud](https://capawesome.io/docs/cloud/getting-started/) can automate those steps. Its guide walks you through the setup.

## Before publishing

Keep secrets on the server and authenticate requests from the app. Follow the [security guidance](docs/integration.md#5-security-the-device-is-not-a-trusted-server), review the [known limitations](docs/compatibility.md), and test your app on its target platforms.

## Explore and contribute

- [See how other apps connect](demo/README.md)
- [iOS and Android embedding](docs/native-embedding.md) · [Capacitor integration](docs/integration.md)
- [Runtime behavior](docs/runtime.md) · [Native rendering API](docs/native-rendering-api.md)
- [Development and testing](docs/development.md) · [Verification scope](demo/tests/README.md)
- [Contributing](CONTRIBUTING.md)

## License

[MIT](LICENSE).
