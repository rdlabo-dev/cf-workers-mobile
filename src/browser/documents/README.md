# Browser documents

This folder owns document rendering, hosting, form submission, registration and
service-worker assets. It depends on browser DOM, navigation and Service Worker
facilities, including those provided by a Capacitor WebView.

Request execution is delegated to `src/cloudflare/workers`. Build-time asset bundling
and source transformation remain in `src/tooling` and `scripts/build-document-assets.mjs`.
See [document rendering](../../../docs/document-rendering.md) for behavior and limitations.
