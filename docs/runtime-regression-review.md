# Runtime regression review — 2026-10-18

Scope: PR #24, based on main `400d022`. An independent manager reviewer compared
implementation changes with main and reviewed each corrective iteration. This is
not certification of complete Workers or OpenNext compatibility.

## Findings and corrections

1. **Upload cleanup:** an isolated handler returning before reading its request
   never cancelled the source; successful EOF also retained the reader lock.
   Cleanup now cancels unread sources and releases acquired readers. Regressions
   cover ignored uploads and successful EOF over real MessageChannels. Empty
   remainder views are also cleared so they do not retain the original large buffer.
2. **Document cancellation race:** cancellation while waiting for readiness or
   response headers could be followed by dispatch or registration of a late
   response stream. Abort checks now prevent dispatch after disposal and cancel
   late response bodies before publication. Both interleavings have tests.
3. **Explicit esbuild loaders:** async lowering overrode `.js: jsx` and non-code
   loaders. It now respects the consumer loader, parses matching JS/TS/JSX syntax,
   and leaves asset/text loaders to esbuild. Tests cover async and synchronous JSX
   and TypeScript-extension files explicitly loaded as text.
4. **Decorator syntax:** the added parser initially rejected decorators, then
   accepted legacy decorators but rejected the standard `export @decorator class`
   placement. It now tries the standard grammar and falls back to the legacy
   grammar for parse errors, retaining esbuild's compiler-option validation and
   decorator lowering. Tests cover legacy constructor parameter decorators and
   standard decorated auto-accessors with the post-export placement.

The first three review rounds requested changes; the fourth approved the fixes
with no remaining required code changes; a final follow-up also approved clearing
empty upload remainder views. The reviewer independently reproduced
and rechecked the decorator inputs. The review also examined KV chunking,
node:http backpressure/early response cleanup, and merged timers/Buffer behavior;
no additional confirmed regression was found in those areas.

## Validation

- Root build and root/demo typechecks pass.
- Unit tests: 326 passed, including four added cleanup/cancellation regressions.
- Build-tool unit tests: 12 passed, including five new loader/decorator cases.
- Document Chromium/WebKit suite: 72 cases satisfy expectations; the existing six
  WebKit Service Worker comparison failures remain explicitly expected. iOS uses
  the native scheme/message bridge, not that WebKit Service Worker comparison.
- Independently installed package: direct 26/26, isolated 22/22, common features
  326 with zero exclusions, preferences 2/2, Vite/esbuild/raw ESM 10/10 and Vite
  development Fetch imports 2/2 pass.
- The main-based PR before this corrective review also passed 94 workerd tests,
  66 production browser tests, 20 development tests and 30 build integrations.
  The changed cleanup interleavings and compiler inputs are covered separately
  above rather than inferred from those earlier runs.

## Native validation and limits

The corrective packed iOS Hono build passed 50/50 and all background, relaunch,
update and reinitialization stages. This run preceded only the final empty upload
remainder-reference cleanup; that cleanup was separately manager-reviewed and
passed the 15 isolated tests and the full 326-unit suite.

Android built successfully, but its run timed out before PACKAGED_RESULT after
another application (`jp.rdlabo.capacitorworkers.d1ui`) took the shared emulator's
foreground and the test application was frozen in the background. A dedicated
read-only emulator was attempted; the emulator refused startup because the host
had only approximately 116 MiB of free disk space. This run is **not** counted as
a pass or evidence of an application regression. An uncontended Android rerun is
still required. Native result JSON, console and build logs remain in the local
packed consumer artifacts (`capacitor-workers-native-package-57wxPU`).

Broader module acceptance, full OpenNext acceptance and required CI remain
separate from the completed code-review cycle; PR #24 remains draft until its
acceptance gate is met.
