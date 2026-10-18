# Worker-rendered native pages

`main.ts` starts `workersCapacitor({ baseURL, render: '/' })`. The selected Worker
returns the whole document. `workers/hono.tsx` and `workers/express.ts` each own
page routes, POST/redirect handling and the JSON API.

Select the Worker in `vite.config.ts`. From `demo/`, build with:

```sh
npm run build:rendering
```

This writes the native web assets to `demo/dist`. Then use the normal Capacitor
workflow from `demo/`:

```sh
npx cap sync
npx cap run ios     # or: npx cap run android
```

The package registers its native plugin automatically (iOS Swift Package Manager,
Android Gradle). No changes to Activity, ViewController or plugin registration are
needed. See [the API guide](../../docs/native-rendering-api.md).

The application code here contains no test driver. Full native acceptance tests
use the same public startup API in `tests/fixtures/apps/packaged-native`.
