# Cloudflare binding dispatch review

## Scope and baseline

The acceptance unit is build-generated HTTP request dispatch for additional
Cloudflare binding declarations and remote ASSETS. Cloud binding implementations,
credentials and lifecycles remain on the deployed Worker. Local ASSETS, Cache API
and HTMLRewriter are not activated or exported by this change.

Production candidate: `48f52b9`, integrating main `86dc481`. Subsequent changes
only extend test runners and documentation. Miniflare `5.20261012.0-beta`,
application compatibility date `2026-10-01`, no extra application flags.

## Review cycle

Manager and independent acceptance reviews are separate local agent reviews,
not GitHub or human approvals.

Both first reviews rejected exposing a partial LocalAssets implementation and
requested real workerd ASSETS, development startup and both native platforms.
The partial implementation, public export and local policy were removed. The
remaining unit dispatches the original HTTP request to the deployed Worker.
The second code reviews found no additional blocking changes.

Final reviews approved candidate `9d1b869` with no outstanding required changes:

- Manager reviewer: confirmed the production diff is unchanged from `48f52b9`,
  the initial LocalAssets finding is resolved, native raw reports match the
  committed evidence, and harness hashes match.
- Independent acceptance reviewer: independently recalculated all six harness
  hashes, matched both 24-case raw native reports, and approved the HTTP-dispatch
  scope and verification evidence.

This approval record is a documentation-only follow-up to that reviewed candidate.
CI remains a separate prerequisite for merging; the PR stays draft pending CI.

## Verification

- Typecheck and production build: pass.
- Full unit run: 409 tests across 41 files pass, no focused tests allowed.
- Packed consumer: Vite/esbuild/browser ESM, configured Fetch Vite development,
  direct and isolated execution, shared feature and preferences contracts pass.
- Independent reviewer rerun: 63 tests across binding dispatch, existing service
  bindings and remote transport pass.
- HTTPS/workerd integration: five groups pass without skips. Vite and esbuild
  worker-first/asset-first builds plus Vite development each run Chromium and
  WebKit in direct and Dedicated Worker modes (20 combinations).
- Fresh packed consumer: iOS and Android each pass all 24 checks, including both
  execution modes. See [native evidence](cloudflare-bindings-native-evidence.json).

The integration checks actual workerd DO HTTP/RPC/storage and unauthorized writes,
ASSETS/SPA/HEAD, ETag/304 with empty body, and Range response/header forwarding.
The pinned workerd fixture returns a full 200 response for the tested Range;
comparison uses that actual oracle, not an assumed 206 response. Browser fixture
cache controls and per-run native URLs prevent cached representations from
contaminating transport comparisons. Artifact checks exclude remote handler
implementation from client JavaScript and source maps.

## Limits

Cloud AI, indexes and Workflows are binding-name dispatch tests, not paid/live
Cloudflare account executions. Native tests use worker-first ASSETS; asset-first
routing is covered by the browser/build matrix. Existing shared transport tests
cover the unchanged transport contracts. These results do not certify local
cloud APIs, WebSockets, or the entire package as release-ready.

## Reproduction

```sh
npm run typecheck
npm run build
npm test -- --allowOnly=false
npm run test:package
cd demo
npm run test:cloudflare-bindings
# In separate terminals, start the HTTPS fixture before preparing/running:
node tests/experiments/d1/native-server.mjs --cloudflare
node tests/experiments/d1/native-prepare.mjs --cloudflare
node tests/experiments/d1/native-run.mjs ios <simulator-id> --cloudflare
node tests/experiments/d1/native-run.mjs android <emulator-id> --cloudflare
```
