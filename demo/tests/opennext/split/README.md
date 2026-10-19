# OpenNext route execution

This fixture uses only `workersCapacitorPlugin({ worker, execution })` and `workersCapacitor()`. The Vite and esbuild configurations select `/`, `/api/message` and `/account` from the existing generated OpenNext Worker. The plugin keeps `/account` remote because middleware matches it; the two independent GET routes render locally. No preparation script or runtime selector override is needed.

Build the library and the ordinary OpenNext sample first, then run:

```sh
npm run build
npm run build:worker --prefix demo/opennext
npm run test:opennext:split --prefix demo
```

Chromium and WebKit tests block the backend while requesting public SSR and the public API. They check remote dispatch for unknown paths, mutations, authentication and Next protocol headers. Output checks include JavaScript and source maps, server SQL, middleware code and the original framework-generated keys. Separate boundary fixtures verify that private environment exports and custom OpenNext configurations stay remote without distributing their contents.

The plugin consumes the existing `.next` and `.open-next` output; it does not rebuild Next.js or modify application source. Temporary split output is removed after compilation; only the inspected code is passed to the bundler. Rebuild/watch tests cover local → network → local transitions when generated configuration changes. See [supported boundaries](../../../../docs/opennext.md#route-execution) before selecting routes for a real app. These browser tests do not establish native split-rendering acceptance.
