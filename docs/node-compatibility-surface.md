# Whole Node compatibility surface audit

This audit covers **all 70 builtin/subpath entries** of workerd `1.20261012.1`,
compatibility date `2026-10-17`, with no extra flags. It does not reduce the scope
to the recent seventeen module families. Initial baseline: `be4de58`; refreshed after the HTTPS, port, stream consumer and DNS additions.

Both Chromium and WebKit report import/export gaps for **32 of 70 entries**.
The other 38 have matching namespace export names; this is **not behavioral
acceptance**. In particular, default exports, prototypes, validation, state,
async context and native transport still require the module-owned contracts.

The test imports every builtin through the **public esbuild plugin** in a fresh
browser realm. Missing imports and evaluation failures are recorded rather than
silently filtered out. This does not stand in for Vite or native acceptance.
The known gap list is explicit completion debt; a new failing module outside
that list fails the audit. Fixing an existing gap is allowed. Remove its entry
from the gap list once the repaired surface is verified, to prevent regressions.

```sh
npm run build
cd demo
npm run test:node-inventory
```

The reproducible code is
[`local-surface.test.mjs`](../demo/tests/experiments/node-compat/local-surface.test.mjs).
The pinned export names are in
[`exports.json`](../demo/tests/experiments/node-compat/exports.json);
[`surface-gaps.json`](../demo/tests/experiments/node-compat/surface-gaps.json)
records outstanding import/export debt. Exact missing/extra names and build
errors are written to `demo/artifacts/node-inventory/{chromium,webkit}-surface.json`.

## Every builtin and subpath

Counts include `default`. “Missing” and “extra” compare namespace export names,
not the methods of default exports or classes. A build failure has no namespace
to compare, so it is never represented as zero missing exports.

| Builtin/subpath       | Workers exports | Local discovery         | Missing | Extra |
| --------------------- | --------------: | ----------------------- | ------: | ----: |
| `_http_agent`         |               3 | Export names match only |       0 |     0 |
| `_http_client`        |               2 | Export names match only |       0 |     0 |
| `_http_common`        |               9 | Build fails             |       — |     — |
| `_http_incoming`      |               2 | Export names match only |       0 |     0 |
| `_http_outgoing`      |               7 | Build fails             |       — |     — |
| `_http_server`        |              10 | Build fails             |       — |     — |
| `_stream_duplex`      |               5 | Export differences      |       2 |    10 |
| `_stream_passthrough` |               2 | Export differences      |       0 |    11 |
| `_stream_readable`    |               7 | Export differences      |       3 |     9 |
| `_stream_transform`   |               2 | Export differences      |       0 |    11 |
| `_stream_wrap`        |               1 | Build fails             |       — |     — |
| `_stream_writable`    |               5 | Export differences      |       3 |    11 |
| `_tls_common`         |               4 | Build fails             |       — |     — |
| `_tls_wrap`           |               3 | Build fails             |       — |     — |
| `assert`              |              21 | Export differences      |       1 |     0 |
| `assert/strict`       |              21 | Build fails             |       — |     — |
| `async_hooks`         |               8 | Export differences      |       5 |     1 |
| `buffer`              |              15 | Export names match only |       0 |     0 |
| `child_process`       |              10 | Export names match only |       0 |     0 |
| `cluster`             |              18 | Export names match only |       0 |     0 |
| `console`             |              26 | Export differences      |       1 |     1 |
| `constants`           |             240 | Export names match only |       0 |     0 |
| `crypto`              |              76 | Export differences      |      40 |     4 |
| `dgram`               |               3 | Export names match only |       0 |     0 |
| `diagnostics_channel` |               8 | Build fails             |       — |     — |
| `dns`                 |              50 | Export names match only |       0 |     0 |
| `dns/promises`        |              49 | Export names match only |       0 |     0 |
| `domain`              |               5 | Export names match only |       0 |     0 |
| `events`              |              15 | Export differences      |      10 |     1 |
| `fs`                  |             106 | Export differences      |      93 |     2 |
| `fs/promises`         |              34 | Export differences      |      27 |     0 |
| `http`                |              21 | Export names match only |       0 |     0 |
| `http2`               |              12 | Export names match only |       0 |     0 |
| `https`               |               7 | Export names match only |       0 |     0 |
| `inspector`           |               8 | Export names match only |       0 |     0 |
| `inspector/promises`  |               8 | Export names match only |       0 |     0 |
| `module`              |              32 | Export differences      |      28 |     0 |
| `net`                 |              18 | Export names match only |       0 |     0 |
| `os`                  |              24 | Export names match only |       0 |     0 |
| `path`                |              17 | Export names match only |       0 |     0 |
| `path/posix`          |              17 | Export names match only |       0 |     0 |
| `path/win32`          |              17 | Export names match only |       0 |     0 |
| `perf_hooks`          |              14 | Build fails             |       — |     — |
| `process`             |              97 | Export differences      |      74 |    12 |
| `punycode`            |               7 | Export names match only |       0 |     0 |
| `querystring`         |               8 | Export names match only |       0 |     0 |
| `readline`            |               9 | Export names match only |       0 |     0 |
| `readline/promises`   |               4 | Export names match only |       0 |     0 |
| `repl`                |               9 | Export names match only |       0 |     0 |
| `sqlite`              |               5 | Export names match only |       0 |     0 |
| `stream`              |              24 | Export differences      |       7 |     6 |
| `stream/consumers`    |               6 | Export names match only |       0 |     0 |
| `stream/promises`     |               4 | Build fails             |       — |     — |
| `stream/web`          |              18 | Export differences      |      10 |     0 |
| `string_decoder`      |               2 | Export names match only |       0 |     0 |
| `sys`                 |              48 | Export differences      |      22 |     0 |
| `test`                |               4 | Export names match only |       0 |     0 |
| `timers`              |              12 | Export names match only |       0 |     0 |
| `timers/promises`     |               5 | Export names match only |       0 |     0 |
| `tls`                 |              18 | Export differences      |      17 |     0 |
| `trace_events`        |               3 | Build fails             |       — |     — |
| `tty`                 |               4 | Export names match only |       0 |     0 |
| `url`                 |              14 | Export names match only |       0 |     0 |
| `util`                |              48 | Export differences      |      13 |     0 |
| `util/types`          |              44 | Build fails             |       — |     — |
| `v8`                  |              23 | Export names match only |       0 |     0 |
| `vm`                  |              11 | Export names match only |       0 |     0 |
| `wasi`                |               2 | Export names match only |       0 |     0 |
| `worker_threads`      |              20 | Export names match only |       0 |     0 |
| `zlib`                |             186 | Export differences      |     122 |     6 |

## Completion order and dependencies

1. Resolve the shared `util`/`util/types`/`sys`, `assert` and `events` surfaces and
   engine boundaries. Consumers must not be certified against a mismatching
   fallback just because their simple examples work. For example, Workers'
   `trace_events` custom inspector uses modern `util.format`, while the existing
   fallback differs for long strings and mixed quotes.
2. Finish streams and their subpaths, then the filesystem, module and process
   surfaces. Existing read-only VFS smoke tests are not complete `fs` coverage.
3. Complete network facades, DNS and TLS against the accepted byte transport;
   preserve their own Workers options, errors and cleanup behavior.
4. Complete crypto/compression algorithm and codec coverage, including sync APIs,
   opaque keys and streaming; importability is not algorithm support.
5. Resolve async context, diagnostics, console/performance and remaining platform
   facades. Engine restrictions require reproductions and a bounded conclusion;
   unfinished work must not be relabeled technically impossible.
6. Run whole-module behavioral contracts, build integrations, packaged-consumer
   and both native execution modes, then the required reviews and CI. This audit
   cannot promote any module to Complete on its own.

## Port and Web Streams counterexamples

The adapter adds HTTPS and three HTTP reference facades, plus a local port
implementation for `worker_threads`. Their export-name gaps are closed; this
alone does not establish whole-module acceptance. The latter still has event
branding, host-object serialization and global-identity differences to resolve.

`stream-boundaries.test.mjs` records two differences in unmodified host streams:
Workers uses the last branch's reason for `tee()` cancellation and delays
`pipeTo()` abort while an input read is pending. Chromium/WebKit use both branch
reasons and abort immediately. These are implementation gaps, not evidence that
stream compatibility is impossible.

`message-port-boundaries.test.mjs` demonstrates that native browser ports deliver
on tasks, whereas Workers delivers on microtasks. Synthetic browser events
cannot redefine their `isTrusted` flag. The local adapter implements microtask
delivery, so it cannot currently provide the native trusted-event brand. This
bounded observation does not waive the remaining implementable port semantics
or prove that every alternative runtime design is impossible.
