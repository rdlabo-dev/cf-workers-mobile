# workers-capacitor

Bring Cloudflare Workers apps to iOS and Android.

workers-capacitor connects existing Cloudflare Workers applications to Capacitor, so you can reuse your pages, routes and application logic in an iOS or Android app with minimal changes. Your web application stays on Workers, with a mobile version you can prepare for distribution through the App Store and Google Play.

[Void 1.1.12](https://github.com/voidzero-dev/void/releases/tag/v1.1.12) adds Capacitor iOS navigation support! With this update, you can bring your Void app to iOS and Android using workers-capacitor. [Get started with Void](docs/void.md).

## Get your app onto your phone

Start with the app you already have. The [integration guide](docs/integration.md) takes you from your existing Workers project to opening it on iOS or Android, including Capacitor setup if this is your first mobile app.

0.1.0 is a Preview release. Follow the installation steps in the guide; APIs may change before a stable release.

If you use an AI coding assistant, open your application repository and give it this prompt:

```text
Follow https://github.com/rdlabo-dev/workers-capacitor/blob/main/docs/integration.md
to bring this app to iOS and Android with workers-capacitor.
Preserve its pages, routes and authentication; verify it on the target platforms.
```

Take the path that matches your app:

- [Void React Pages + D1](docs/void.md)
- [Hono and Workers Express](docs/build-setup.md#frameworks)
- [Next.js / OpenNext](docs/opennext.md)

## Keep building the app you know

Keep working with your existing pages, forms and routes. [Capacitor](https://capacitorjs.com/) makes your web interface an installable mobile app; workers-capacitor connects your existing Worker to it.

Your database can stay where it is. Requests that need D1 or other cloud services run on your existing deployed Worker, while supported code can run on the device. See [build setup](docs/build-setup.md) and [execution policies](docs/cloudflare-bindings.md) when you need the details.

If you already have a separate frontend, keep its existing API calls with the [Fetch-only integration](docs/runtime.md#fetch-only-integration).

## Next steps

Your app is on screen! Now make it your own, one step at a time:

1. Make your app easy to recognize on the home screen and when it opens. Add your own icon and splash screen with [Capacitor's asset guide](https://capacitorjs.com/docs/guides/splash-screens-and-icons), then rebuild and run the app again to see your changes.
2. Make the screen comfortable to use. Check that buttons stay clear of the notch and home indicator; adjust [iOS Safe Area](docs/native-rendering-api.md#ios-safe-area) if needed.
3. Let users take a photo, share content or get haptic feedback after an action. Pick one feature that suits your app and add it with a [Capacitor plugin](docs/native-rendering-api.md#native-plugins).
4. When repeated builds and store uploads start taking time, [Capawesome Cloud](https://capawesome.io/docs/cloud/getting-started/) can automate those steps. Its guide walks you through the setup.

## Before publishing

Keep secrets on the server and authenticate requests from the app. Follow the [security guidance](docs/integration.md#5-security-the-device-is-not-a-trusted-server), review the [known limitations](docs/compatibility.md), and test your app on its target platforms.

## Explore and contribute

- [See how other apps connect](demo/README.md)
- [Runtime behavior](docs/runtime.md) · [Native rendering API](docs/native-rendering-api.md)
- [Development and testing](docs/development.md) · [Verification scope](demo/tests/README.md)
- [Contributing](CONTRIBUTING.md)

## License

[MIT](LICENSE).
