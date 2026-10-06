# Staggered opening: implementation and verification

Initial openings now finish composition and token preparation before publishing exact
closed pages from the existing paginator. Frozen pages append individually and become the
same objects in the final complete snapshot. Warm updates remain atomic. The scheduler
paces visible preparation after a frame and task; geometry, reconciliation and mounting
remain separately observable. Paragraph bounds avoid detailed line reads only for
conservatively supported structures; splitting and heading lookahead still use exact lines.
Profile mode omits unused metadata by default while visible tokens retain provenance.

## Shared eight-millisecond budget: October 6, 2026

The scheduler now shares one absolute eight-millisecond deadline between visible pagination
callbacks and initial-opening page appends. A window starts in a task following a frame;
appends take precedence among queued paced work and include their awaited Svelte DOM flush.
Every additional transaction checks elapsed time. Page publication after the first page no
longer ends preparation automatically, and completion drains outstanding mounts individually.
Semantic preparation and pre-display pagination keep their existing four-millisecond slices.
The first exact page mounts alone before the viewer acknowledges its paint opportunity with
both generation and layout epoch. Cancellation releases the controller's wait; obsolete
acknowledgements cannot resume it. Warm atomic updates and idle preparation retain their
existing scheduling.

Comparison used two isolated copies of the current workspace, taken immediately before and
after this change. The baseline here is the already progressive implementation, not the bulk
renderer in the historical comparison below. Direct Chrome DevTools Protocol observation used
temporary development routes with the same actual 113-block, 7,134-token, 18-page seed and
all seven declared Inter font faces confirmed loaded and a settled epoch. The document uses
its unchanged system Arial profile. Ten fresh openings per implementation ran
interleaved, alternating order, in one local headless desktop Chrome process. An earlier trial
blocked Inter assets in the temporary Vite copies; its timings were replaced after fixing
the inspection setup and requiring successful font loading. Source acceptance
was local; backend and route-navigation latency are excluded. No browser framework or tests
were added, and inspection routes exist only in temporary copies outside the workspace.

| Observation, median (range), milliseconds |   Progressive baseline |         Shared 8 ms |
| ----------------------------------------- | ---------------------: | ------------------: |
| First exact page in DOM                   |       84.0 (62.6–99.8) |    77.5 (64.6–95.5) |
| First display paint opportunity           |      91.6 (72.0–109.4) |   85.9 (72.3–103.4) |
| Complete snapshot                         | 1042.8 (1019.8–1115.4) | 569.8 (541.5–863.3) |
| Complete mounted readiness                | 1044.2 (1021.2–1116.8) | 574.8 (553.2–864.6) |
| Active profile resolution                 |    184.8 (160.2–206.2) | 168.0 (163.2–303.6) |
| Total individual mounts through tick      |    155.5 (125.1–160.3) | 144.1 (142.0–267.5) |
| Largest preparation callback              |       16.5 (15.2–20.5) |    13.8 (12.8–16.7) |
| Largest mount through tick                |       18.9 (16.4–22.1) |    20.7 (17.8–25.5) |
| Total measured shared-window duration     |            Unavailable | 296.5 (289.7–557.1) |
| Largest shared window                     |            Unavailable |    20.7 (17.8–25.5) |
| Largest frame gap after first display     |       16.8 (16.7–16.8) |    16.8 (16.7–33.3) |

Median readiness improved 45.0%; every paired opening improved, with a 16.1–50.4% reduction.
First-display timing stayed comparable and retained the earlier gain over bulk mounting.
One changed run had slower profile DOM updates and mounting (864.6 ms readiness), reported
rather than discarded. All ten openings on each implementation had zero observed long
tasks between request and readiness. One counted changed opening had a 33.3 ms frame gap;
the other nine stayed at 16.7–16.8 ms. Three extra pairs were included to check that gap,
and it did not recur. An earlier uncounted probe also had an isolated 33.3 ms gap. These
observations do not show a sustained responsiveness regression; indivisible mounts reached
25.5 ms and remain a limit regardless of the cooperative budget. The budget stays eight
milliseconds for this measured environment.

The changed runs used a median 26 preparation callbacks (25–33), 29 paced windows (29–46),
and 18 individual mounts, versus 45 preparation callbacks (44–49) in the baseline. A median
10 windows (1–11) combined multiple operations. Most windows overran: median 28 (27–45),
because the final indivisible measurement or mount crossed the deadline. No further operation
starts in an expired window. Numeric instrumentation in `__contractSchedulerPerf` retains at
most 100 samples of window start, budget and elapsed duration, preparation callbacks and time,
appended pages and mount time including DOM flushes, and overruns. It retains no text, elements,
nodes or callbacks. Baseline shared-window duration is unavailable; active preparation and
mounting totals were already instrumented and are reported separately.

In every measured opening the first page object, page element, text node and native selection
survived appends and final snapshot adoption. Scroll reached 900 CSS pixels during preparation.
A separate cross-page native range still covered 2,012 characters and 337 rectangles. Full
baseline and changed page records matched. Changed progressive records also matched fresh
exact pagination for the seed, all 26 concessions and the free-form preview.

Three further interleaved lifecycle observations per implementation gave median prepared
retained reactivation of 1.5 ms baseline / 1.4 ms changed, warm Apply of 34.0 / 31.3 ms, and
remove of 22.4 / 18.4 ms. These small local observations establish no general warm-speed claim:
the warm path was left unchanged. All reused the complete retained snapshot and text node;
warm changes kept the previous complete document displayed, used atomic mounts, reused 15
pages, and had zero foreground profile misses. Cached-selection disagreement hid obsolete
content and started progressive preparation.

Injected failure before display showed no document or complete snapshot. Failure after two
pages retained those pages with readiness false and the incomplete-document Retry message.
Both retries completed 18 pages. Cancelling a displayed partial opening cleared pending,
displayed and mounted content; restarting completed normally. A deliberately withheld viewer
acknowledgement held preparation at one page for 80 ms. Cancellation and profile-surface
invalidation each released that wait; subsequent openings completed with new generations
and obsolete acknowledgements did not resume the old request. An inactive retained opening
also prepared all 18 pages and became ready on activation.

Remaining cost is measured block profiling (median 168.0 ms, including 117.7 ms profile DOM
updates and 46.5 ms reads) and mounting (144.1 ms), plus the paint opportunities separating
windows. Profiling still uses 113 scoped block transactions, as intended. This pass stops at
the shared budget; no profiling, batching, CSS or semantic changes were made.

Automated results are separate from these browser observations. `npm run verify` passed all
13 existing performance tests, type checking with zero errors or warnings, and the
production build. `npm run seed:verify` passed all 58 cases with zero production reconciliation
mismatches. They preserve priority/cancellation/destruction, caching/saving, semantic and
provenance guarantees described below; they do not automatically prove the shared deadline,
DOM identity, native selection or browser responsiveness. No assertions were weakened and
no tests were added. Mobile/slower CPUs, physical presentation, sustained user gestures,
active font changes, production backend navigation, full-app creation/history timing,
authoring/search/highlight chrome, retention eviction and arbitrary authored structures remain
unverified in browser. The local comparison supports acceptance for this measured desktop
seed environment, not a production-wide performance guarantee.

## Historical controlled local browser comparison

The observations below predate the shared-budget pass and are retained as history. Their
font-loading setup was not revalidated in this pass; current acceptance uses the repeated,
font-checked comparison above.

Manual Chrome DevTools Protocol inspection used the production document components in a
temporary development route with the actual 113-block seed source, 7,134 prepared tokens
and 18 pages. The route used local source acceptance, without backend or navigation
latency. Both baseline and changed code ran with fonts explicitly loaded and their epoch
settled before requesting preparation. The baseline used the repository's previous renderer,
profiler, paginator and viewer. No browser test framework or tests were added; the temporary
route was removed after inspection.

These are individual development observations, not statistical production benchmarks.
Times below start at the render request. A frame followed by a task establishes a paint
opportunity, not proof of physical presentation.

| Observation                                       |                     Baseline |                 Staggered |
| ------------------------------------------------- | ---------------------------: | ------------------------: |
| First exact page in DOM                           |         263 ms, all 18 pages |           74 ms, one page |
| First display paint opportunity                   |                       283 ms |                     84 ms |
| Complete snapshot                                 |                       163 ms |                  1,135 ms |
| Complete mounted document / interaction readiness |                       231 ms |                  1,136 ms |
| Opening long tasks (request through readiness)    |             112 ms and 90 ms |             None observed |
| Largest measured preparation callback             |     Whole-document profiling |                   17.5 ms |
| Largest measured page mount through Svelte tick   | 67.6 ms complete-commit tick | 20.7 ms single-page mount |
| Prepared retained reactivation                    |                       2.3 ms |                    1.6 ms |
| Prewarmed Apply                                   |                      19.3 ms |                   16.4 ms |
| Prewarmed remove                                  |                      13.3 ms |                   13.3 ms |

The changed opening ran 51 pagination/preparation callbacks and 18 individual page mounts.
Total active profile resolution was 197 ms versus 127 ms for baseline bulk resolution;
the changed surface used 113 scoped block transactions rather than one full-document batch.
The remaining completion cost includes deliberate frame pacing. This is a material increase
in full readiness, not a modest overall latency improvement. First reading improved and
long tasks disappeared in this observation, but production completion-cost acceptance
remains outstanding. Four milliseconds is a cooperative target: indivisible layout and DOM
updates exceeded it in this run.

At first DOM display the render was still pending and interaction readiness was false.
The first page object, page element, text node and native selection survived all appends
and final adoption. Scrolling reached 900 CSS pixels while preparation was still running;
the largest observed animation-frame gap after display was 16.8 ms. A later native selection
across pages covered 2,012 characters and 337 rectangles. Prepared reactivation reused the
same complete snapshot and text node. Apply/remove retained the displayed complete contract,
reused 15 pages, and required zero foreground profile misses or surface batches. Cached
selection disagreement hid the obsolete document and started progressive preparation.

## Geometry and lifecycle inspection

Full serialized baseline and staggered page records matched. Separately, progressive bounds
pagination matched freshly measured exact pagination for the unchanged seed, all 26 individual
saved concessions, and a free-form authoring preview. Comparing complete page records includes
page boundaries, text and token records, fragment intervals, table columns, source coordinates,
generated offsets, revisions and annotations. This covers the seed's heading boundaries,
paragraph continuations, final spacing, empty insertion slots and repeated table headers.
It does not establish parity for every possible authored structure or CSS/font environment.

Injected failures before first display produced no visible document or complete snapshot;
Retry completed all 18 pages. A failure after two closed pages retained those pages, kept
readiness false, and showed the incomplete-document message and Retry. Retry again completed
18 pages. Cancelling a displayed partial opening cleared its pending job, mounted pages and
displayed snapshot; restarting completed normally. Font readiness and initial epoch invalidation
were observed before the controlled request; active font changes need broader final validation.

The lifecycle code separates first visibility from full readiness: creation closes once at
first exact display, and opening history records once at readiness. Search consumes only a
displayed complete snapshot, including during warm updates. Clause activation and authoring
require complete current mounted content. Partial pages count toward inactive retention;
invalidation and eviction discard them. These code guarantees have not all been exercised
through the full application chrome in this browser inspection.

## Automated guarantees and remaining acceptance

`npm run verify` passed after removing the inspection route: all 13 existing performance
checks passed, Svelte reported zero errors and warnings, and the production build completed.
`npm run seed:verify` passed all 58 cases with zero production reconciliation mismatches.
Its scheduler assertions cover foreground priority, queued cancellation and destruction;
cache assertions cover memory/IndexedDB reopening and confirmed-state persistence without
rewriting immutable source; saving assertions retain no-op, validation and revision-conflict
guarantees. These assertions do not automatically verify frame pacing or partial-page behavior.

The seed verifier checks 58 cases against frozen semantic expectations, production composition
parity, token/provenance conservation and fragment conservation. It uses synthetic geometry
and cannot establish browser layout fidelity or responsiveness. No assertions were weakened,
and no tests were added or expanded.

Production/browser acceptance remains unverified for mobile and slower CPUs, physical
presentation and input latency, broader authoring combinations, full chrome search/highlight
and clause flows, creation/history integration, active font changes, and retention-budget
eviction combinations. The local geometry and responsiveness evidence above supports the
implementation but does not replace those checks.

Instrumentation is bounded and local: `__contractRenderPerf` records first page publication,
complete snapshot, preparation slice count and maximum duration; `__contractColdStart`
records first exact display and full readiness separately; `__contractPageMountPerf`
records append/atomic flush durations without contract text or DOM references.
