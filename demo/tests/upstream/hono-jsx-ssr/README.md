# Upstream check: honojs/examples `jsx-ssr`

Runs the unmodified upstream Hono example inside Capacitor document
rendering and compares it with the same code in local workerd. The upstream
source is never committed; `test:upstream:prepare` fetches it into the
git-ignored `artifacts/upstream/` clone and copies it into the independent
consumer.

## Provenance

| Field         | Value                                                                |
| ------------- | -------------------------------------------------------------------- |
| Repository    | https://github.com/honojs/examples                                   |
| Commit        | `3b0b62875a0e1265763fea1c6388866d5697ef81`                           |
| Subdirectory  | `jsx-ssr` (entry `src/index.tsx`, `export default app`)              |
| License       | MIT (repository README; no LICENSE file exists at the pinned commit) |
| Declared deps | `hono ^4.2.4`, `wrangler ^3.53.0` (no lockfile upstream)             |
| Resolved dep  | `hono 4.13.13` inside the declared range, matching this repository   |

Upstream behavior relied on by the assertions:

- `GET /` renders `<Top>` with five post links (`/post/1`…`/post/5`); post 5
  is `こんにちは` / `昼からビールを飲みます` (UTF-8).
- `GET /post/:id{[0-9]+}` renders `<Page>` for existing posts.
- `GET /post/99` matches the route but finds no post → `c.notFound()` 404.
- `GET /post/abc` and unmapped paths miss the route → Hono default 404
  (`text/plain` body containing `404 Not Found`).

## What each layer verifies

- `upstream.test.ts` (local workerd, `createTestHarness`, upstream
  `compatibility_date` 2024-04-01): HTTP status and body for every route
  above. Requires the artifacts clone.
- `fixture/` + `worker.ts`: the Capacitor consumer. `main.ts` calls
  `workersCapacitor({ baseURL: "https://worker.invalid", render: "/" })`;
  the Vite plugin bundles `worker.ts`, which injects `public/probe.js` into
  upstream HTML responses only (404 `text/plain` bodies are untouched). The
  `upstream-worker` alias resolves to the copied upstream entry; the
  upstream source and router are not modified.
- `fixture/public/probe.js`: in-document driver. `screen:` cases assert the
  rendered document (title, headings, links, URL, charset). `fetch:` cases
  assert HTTP status and body through the local transport for the 404
  routes. `iframe:` asserts the upstream 404 body renders inside a frame as
  an additional structured check — it does not replace top-level
  navigation. After reporting, the probe navigates the top level to
  `/post/99`; no script executes on that `text/plain` page, so the runner
  captures a screenshot for visual verification recorded separately from
  the structured cases.
- Each native run generates `public/probe-run.json` with a fresh run ID before
  building. The probe resets completed or interrupted progress only when that
  ID changes, preserving progress during navigation within the same run. The
  runner also rejects reports from any other run. `probe.spec.ts` verifies these
  cases in Chromium and WebKit.
- The runner requires the exact declared case set in `upstream.json`
  (`probeCases`) to be reported with every case passing; an early or
  partial report fails the run.
- `fixture/capacitor.config.json` leaves `ios.contentInset` unset. Native
  Worker documents default to `automatic` so content clears the Safe Area.
  Applications can override this using the standard Capacitor
  `ios.contentInset` setting (`automatic`, `scrollableAxes`, `never`, or
  `always`). For example, choose `never` when handling Safe Area with CSS.
  Run `npx cap sync ios` after changing the configuration.

## Reproduce

From `demo/` (after the library `npm install && npm run build` at the repository
root and `npm install` here):

```sh
# 1. Pinned sparse clone into demo/artifacts/upstream/hono-jsx-ssr/clone
#    (add --clone-only to skip consumer setup) plus consumer verification:
npm run test:upstream:prepare -- hono-jsx-ssr

# 2. HTTP baseline in local workerd:
npm run test:upstream:workerd

# 3. Native rendering on a booted simulator/emulator:
npm run test:upstream -- hono-jsx-ssr ios <simulator-UUID>
npm run test:upstream -- hono-jsx-ssr android <emulator-serial>
```

The consumer lives in a fresh OS temp directory recorded in
`demo/artifacts/upstream/hono-jsx-ssr-consumer.json`; it installs the
`npm pack` tarball and registers the plugin through ordinary
`cap add`/`cap sync` without native overlays or a custom
Activity/ViewController. Structured results, console logs and screenshots
are copied to `demo/artifacts/upstream/hono-jsx-ssr/` (git-ignored); build
logs stay in the consumer's `artifacts/`.

## CI: pinned source and browser Fetch Handler checks

After root/demo installation and the library build, the same commands used by CI are:

```sh
npm run test:upstream:prepare -- hono-jsx-ssr --clone-only
npm run test:upstream:workerd
npm run test:upstream:browser
```

`cases.ts` contains six shared HTTP expectations. Workerd evaluates the original entry; `browser/` builds it through the public Vite plugin and calls the public `workersCapacitor` API. `browser.spec.ts` checks the same responses in Chromium/WebKit and explicitly asserts `direct` and `worker` execution. Returned HTML is inspected as a response, not displayed or used as a substitute for native document navigation. Native checks above continue to verify actual documents.

CI uses the root and demo lockfiles, and checks the installed Hono version against `upstream.json`. `sample.ts` rejects a missing, dirty, or wrong-commit clone before tests/builds run. The clone is obtained by the explicit prepare command; ordinary unit tests do not fetch the network. The source pin is updated through a reviewed change to `upstream.json`, not by following the upstream default branch.

Reports are written under `demo/artifacts/upstream/`; Playwright saves screenshots and traces for failed cases. GitHub Actions uploads these with `upstream.json` even when a test fails. Full native consumer preparation remains separate and uses its existing fresh `npm install`.
