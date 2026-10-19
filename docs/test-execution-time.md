# Test execution cost

Issue #52 tracks execution cost without changing required coverage.

## Baseline

[Successful Compatibility run 39276706316](https://github.com/rdlabo-dev/workers-capacitor/actions/runs/39276706316) on Ubuntu 24.04 provides the baseline. GitHub job/step timestamps (one-second resolution) give:

| Measure                                   | Baseline |
| ----------------------------------------- | -------: |
| Trigger to required CI completion         |    729 s |
| First job start to required CI completion |    725 s |
| Sum of 23 job execution durations         |  6,811 s |
| Browser setup across 20 two-engine jobs   |    929 s |
| Library builds across 22 jobs             |     32 s |
| Type checks across 20 jobs                |     20 s |

The first jobs started 4 seconds after the trigger. Several jobs waited longer: upstream 144 s, pknotes 167 s, inkstone 116 s, flare-stack-blog 54 s, OpenNext 48 s. These start delays are scheduling/queue observations, not test execution. The final CI aggregation job starts after its dependencies and must not be counted as runner queue time. Job-duration sums exclude queue time; workflow `updated_at` is not the CI completion time.

The longest jobs were sink (620 s), inkstone (604 s), flare-stack-blog (500 s), and OpenNext (488 s). Native emulator/test steps cost roughly 207–340 s each. Those checks protect distinct applications and are retained. Cache-hit state was not collected for this historical baseline, so it is not a controlled cold/warm comparison.

## Change

Short suites with matching Node versions share setup, then run sequentially:

- Node 22: build-tools, minvoice/authentication, upstream OpenNext.
- Node 24.21.0: Void, pknotes.

Every original test/preparation command is retained, in its original order within each suite. Each shell step fails on the first failing command. No test assertion, browser engine, package consumer, workerd, native scenario, or required-check dependency is removed. Matrix `fail-fast: false` and the final all-jobs-success gate remain unchanged. A failed command may prevent later suites in its group from running, but cannot yield a passing CI result.

The three eliminated jobs previously spent 132 s preparing browsers and about 102 s on other setup/cleanup. The initial target is to remove those three setup sequences (approximately 234 runner-seconds, about 3% of the baseline total), without extending the critical path. The grouped Node 22 job is projected at roughly 300 s and the Node 24 job at roughly 180 s, below the existing longest jobs. These are estimates from historical timings, not measured improvements or promises about queue time.

No fixture artifact or compiled output is cached or shared between jobs. Each job still checks out its own source, installs dependencies, and builds the library. Upstream preparations recreate their own application outputs. Mutable main OpenNext builds and native emulators retain their existing isolated jobs. The existing npm download cache does not replace installation, compilation, or execution; changes to source/configuration are always rebuilt.

## Verification and remaining measurement

Local verification runs the grouped command sequences in order with their matching Node versions, plus `actionlint .github/workflows/ci.yml`. This validates shared-checkout isolation; it does not reproduce Linux browser setup or hosted-runner timing.

Local results: build-tool unit tests (18), Chromium/WebKit build-tool checks (30), minvoice/authentication checks (4), upstream OpenNext acceptance, Void integration/routes, and pknotes acceptance passed. Both supervisory and independent acceptance reviews found no remaining changes to request.

Before closing #52, run the complete required CI on this revision with a cold npm cache and again with the warm cache, and record trigger/first-start/CI-completion timestamps and summed job durations. Compare with an ungrouped run on the same revision and runner image/cache state. Use several runs if noise exceeds the expected 234-second reduction. Preserve failures and queue delays separately. No CI timing improvement is claimed until that comparison is available.
