# workers-capacitor

Bring Cloudflare Workers apps to iOS and Android.

Let new users discover your app in the App Store and on Google Play. workers-capacitor helps you bring your existing Cloudflare Workers app to iOS and Android with minimal changes, while keeping your web app running.

Void support is here with [Void 1.1.12](https://github.com/voidzero-dev/void/releases/tag/v1.1.12)! [Bring your Void app to mobile](docs/void.md).

## Get started

Follow the [integration guide](docs/integration.md) to install Capacitor, connect your existing Worker and run your app. It covers both your first mobile app and an existing Capacitor project.

0.1.0 Preview is available to try from a source-built package. Installation steps are in the guide; APIs may change before a stable release.

If you use an AI coding assistant, open your application repository and give it this prompt:

```text
Follow https://github.com/rdlabo-dev/workers-capacitor/blob/main/docs/integration.md
to bring this app to iOS and Android with workers-capacitor.
Preserve its pages, routes and authentication; verify it on the target platforms.
```

For your framework's configuration:

- [Void React Pages + D1](docs/void.md)
- [Hono and Workers Express](docs/build-setup.md#frameworks)
- [Next.js / OpenNext](docs/opennext.md)

## How it fits your app

[Capacitor](https://capacitorjs.com/) packages your web interface as an installable mobile app. workers-capacitor connects your existing Worker's pages and APIs to it, so you can keep your routes, forms and rendering approach. Capacitor plugins give your app access to native device features.

Supported code can run on the device. Requests that need D1 or other cloud services run on your existing deployed Worker. D1 stays on Cloudflare. See [build setup](docs/build-setup.md) and [execution policies](docs/cloudflare-bindings.md) for the details.

Already have a separate frontend calling Worker APIs? Use the [Fetch-only integration](docs/runtime.md#fetch-only-integration).

## Next steps

Once your app is running, make it feel at home on a phone:

- Keep buttons and content clear of the notch and home indicator. Start with the default insets, then adjust [iOS Safe Area](docs/native-rendering-api.md#ios-safe-area) for your layout.
- Add a native touch, such as the camera, sharing or haptic feedback. Follow the [Capacitor plugin integration guide](docs/native-rendering-api.md#native-plugins).
- Automate releases with [Capawesome Cloud](https://capawesome.io/docs/cloud/app-store-publishing/submit-automatically/): connect your repository, configure signing and store destinations, then trigger builds and store submissions from release tags.

## Before publishing

Keep secrets on the server and authenticate requests from the app. Follow the [security guidance](docs/integration.md#5-security-the-device-is-not-a-trusted-server), review the [known limitations](docs/compatibility.md), and test your app on its target platforms.

## Explore and contribute

- [Examples](demo/README.md)
- [Runtime behavior](docs/runtime.md) · [Native rendering API](docs/native-rendering-api.md)
- [Development and testing](docs/development.md) · [Verification scope](demo/tests/README.md)
- [Contributing](CONTRIBUTING.md)

## License

[MIT](LICENSE).
