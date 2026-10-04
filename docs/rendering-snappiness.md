# Contract geometry compilation and pure pagination

The renderer composes provenance-preserving blocks, prepares stable tokens, resolves
browser layout profiles, paginates the entire document, reconciles page identities,
and commits one complete `RenderSnapshot`. Geometry is incremental; page assignment
always starts at block zero. A cache-only render never touches the profiling DOM.

## Composition and preparation

The workspace composition engine retains the accepted immutable source index,
source atoms, Trigger annotations, address dependencies and resolved container versions.
Wording changes dirty their containers; optional activation also updates numbering and
reference dependencies, including references introduced by replacements. Invalid input
does not replace accepted composition state. Successful container results remain reusable
when a request is superseded.

`LayoutPreparationEngine` reuses prepared blocks by resolved identity and table-cell
tokens by cell-content identity. Geometry fingerprints include text, revisions,
annotation segmentation and layout-affecting fragment properties. They exclude source
coordinates and generated offsets, which remain on current tokens. Matching geometry
permits profile reuse; matching prepared content identity permits page reuse.

Live authoring removes the entire selected range and adds the complete replacement.
Saved concessions may use a bounded readable redline. Effective wording, source slices,
generated offsets and annotations follow the rules in
[Document projection and composition](overlay-rendering.md).

## Browser geometry compilation

The app layout mounts a persistent `LayoutProfileSurface` and provides its `LayoutProfiler`
to route viewers. A standalone viewer, or `PUBLIC_CONTRACT_ROUTE_PROFILES=0`, uses the
original viewer-local host. The profiler
serializes surface access, resolves cached geometry and deduplicates missing fingerprints
before making one whole-block batch call. Request-local associations use current prepared
objects. `LayoutProfileCache` retains all shapes in the latest resolved document and a
256-entry LRU of other shapes for one layout epoch. Idle alternatives cannot evict current
geometry, including in documents larger than the LRU. The cache validates and freezes
explicit geometry fields without retaining content or provenance.

The hidden, inert surface renders production `BlockFragment`, inline, revision and source
components at contract content width. Profile mode retains layout wrappers while suppressing
heading IDs, focus semantics and Trigger activation. Each source leaf carries an unconditional
`data-contract-token` marker. Hidden leaves retain full source metadata by default.
`PUBLIC_CONTRACT_PROFILE_METADATA=0` opts into omitting unused source-coordinate
attributes while keeping the same spans and text. Unset or `1` keeps full metadata.
Visible leaves always retain all selection and provenance metadata; annotation
and revision wrappers remain identical. All first-pass
DOM writes precede geometry reads. Tables share one additional write/read pass under canonical
columns. The surface clears hidden content after every batch, including failures.

Profiles contain fractional CSS-pixel geometry:

- Headings retain their complete outer height.
- Paragraphs retain contiguous, half-open token ranges for browser-observed visual lines.
  Allocated line boxes include line-height leading; glyph rectangles alone do not define
  fragment heights. Collapsed whitespace keeps its tokens without allocating a line;
  an empty insertion slot can allocate one unsplittable line.
- Tables retain canonical column widths, repeated-header height, whole body-row heights,
  margins and explicit outer border contributions. Every fragment uses those columns.

Preparation exposes ASCII-hyphen boundaries while preserving characters and provenance.
A remaining token spanning multiple visual lines fails explicitly. Validation checks
numeric geometry, line order, token coverage, columns and rows. The 0.01 CSS-pixel tolerance
compares equivalent observed coordinates only; page-fit arithmetic has no overflow allowance.

The surface publishes readiness after fonts settle. Font loading immediately invalidates
retained handles, and completion publishes a new epoch. Epochs distinguish surface mounts
as well as layout policy. The profiler checks the live epoch before and after profiling
and rejects stale results before cache insertion. A new epoch prevents old page reuse.

## Pure pagination and reconciliation

`paginatePreparedDocument(blocks, profiles, options)` is synchronous and DOM-free. It
assigns all pages using request-local profiles, with no cache access or previous-page input.
Paragraphs split only at complete observed lines. Each fragment retains its start margin;
only the final fragment includes end spacing. If final spacing does not fit, the last line
moves with it. Headings keep with the next paragraph's first actual line, including final
spacing when that paragraph has one line.

Tables move whole to a fresh page when they fit there. Larger tables split only between
whole body rows and repeat original headers under canonical columns. Header-only tables
remain supported. An oversized visual line, heading/first-line pair, or table
header-plus-row fails with a technical layout error.

Each page has ordered placements associating prepared content with fragment kind,
interval and presentation. `reconcilePages()` runs after complete pagination. At the same
page position and epoch, equal prepared identities, intervals and presentation retain the
previous page object. Table column values must also agree. Moved or differently sliced
content keeps the candidate page. Changed page numbers include removed pages.

## Complete snapshots and interactions

`ContractRenderController` serializes requests and checks generation and live epoch after
profiling and immediately before committing, including after commit listeners. The same
currentness check runs when queued profiling starts and before inserting its results, so
cancelled or superseded requests skip pending DOM work. A published
snapshot contains accepted source, concessions, preview changes, pages, epoch and changed
page numbers. Page records, placement records and their arrays are frozen at publication;
prepared content follows the immutable input contract.

Cold loads show `LoadingPagination` until the first complete snapshot commits. Warm requests,
cancellations and technical failures retain the previous complete document. Retry resubmits
current valid source and intent. Search can use the displayed snapshot during warm work;
authoring and Trigger availability require current source, selection, preview and epoch,
with no pending work, error or active conflict. Interaction controllers attach after the
first complete snapshot and survive warm commits.

Page-number keys preserve unchanged DOM. Highlights refresh changed page geometry and retain
unchanged range contributions; hover and pressed-state updates affect paint separately.
Search updates changed source blocks, retains unchanged ranges and performs no traversal
for an empty query. Authoring ranges retain identity when source and intersecting pages
remain unchanged. Viewport anchoring captures a visible baseline point before commit,
prefers the same fragment/cell occurrence afterward, and restores its offset only if the
stage stays connected and the user has not scrolled.

## Idle prewarming

After a complete current snapshot without an authoring preview, the viewer schedules known
saved Apply/remove alternatives. Private composition/preparation engines use normal redline
rules and fingerprints without disturbing foreground content identities. Each choice varies
one item against the current selection; conflicts are skipped. After establishing current
composition versions once, only changed blocks and their numbering/reference dependencies
are resolved and prepared. Warming stops when the optional cache has no free slots.
Prewarming populates the ordinary profile cache and never publishes pages or snapshots.

Idle callbacks spend at most 4 ms between indivisible composition/preparation units and
yield after profiling one new shape. One block profile can exceed that budget. Browsers
without idle callbacks use 100 ms delayed timer slices. Input, source, preview, readiness,
epoch and teardown changes dispose the job. Foreground profile requests invalidate queued
and in-flight warm results before cache insertion; an already-running surface call finishes
before foreground work uses that surface. Correctness never depends on warming. Free-form
authoring possibilities and combinations of page assignments are not predicted.

## Local performance instrumentation

Development builds, or production with `PUBLIC_CONTRACT_PERF=1`, retain at most 100 entries
in each browser array. Instrumentation sends no analytics and stores no contract text.
`window.__contractColdStart` records source request, availability and acceptance milestones;
server/navigation latency requires a browser trace. `window.__contractRenderPerf` records
foreground requests only. Idle work receives no render metrics and does not alter samples.
Phase durations and partial composition/preparation counters are recorded on failure too;
completion timestamps are only recorded when a phase succeeds.

| Fields                                                                   | Meaning                                                                                                                                         |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `generation`, `sourceRevision`, `layoutEpoch`                            | Request and geometry environment identity                                                                                                       |
| `requestedAt`, `inputAt`, `renderStartedAt`                              | Browser-time-origin timestamps; capture records admin input and workspace clicks before handlers. Without a recent input, request time is used. |
| `composeMs`, `prepareMs`                                                 | Separate composition and preparation durations                                                                                                  |
| `affectedContainers`, `blocksRecomposed`                                 | Dirty containers and resolved blocks rebuilt by composition                                                                                     |
| `blocksProcessed`, `tokensProcessed`                                     | Blocks newly prepared and tokens newly tokenized; cache hits are excluded                                                                       |
| `compositionCompleteAt`, `preparationCompleteAt`, `paginationCompleteAt` | Completed phase timestamps                                                                                                                      |
| `profileResolveMs`                                                       | Entire resolution duration, including shared-surface queue wait, cache lookup, profiling, validation and associations                           |
| `profileCacheHits`, `profileCacheMisses`                                 | Input block occurrences whose geometry was present or absent during cache resolution; duplicate missing shapes still count as misses            |
| `profileUniqueMisses`, `profileBatchCount`                               | Distinct missing fingerprints and attempted surface batches                                                                                     |
| `profileDomUpdateMs`                                                     | Batched surface DOM updates, canonical table update and hidden-content cleanup                                                                  |
| `profileReadMs`, `maxProfileBlockMs`                                     | Total geometry-read time and largest block's read time; both table passes contribute                                                            |
| `profileTotalMs`                                                         | Surface-call duration including DOM updates, reads and cleanup, excluding queue wait and cache validation                                       |
| `paginateMs`, `reconcileMs`                                              | Pure full-document pagination and content-safe reconciliation durations                                                                         |
| `pageCount`, `pagesChanged`, `pagesReused`                               | Final pages, changed page positions (including removed positions), and retained page objects                                                    |
| `snapshotAt`, `totalMs`                                                  | Snapshot assignment timestamp and request-to-assignment duration; cancelled/failed requests record time to termination                          |
| `commitToDomMs`, `settledTotalMs`                                        | Assignment-to-Svelte-tick and request-to-tick durations                                                                                         |
| `paintOpportunityAt`, `inputToPaintOpportunityMs`                        | Post-tick animation frame followed by a timer; a paint opportunity, not proof of physical presentation                                          |
| `cancelled`, `failed`                                                    | Request termination flags                                                                                                                       |

Samples are copied at commit, after the DOM tick and after the paint opportunity. Partial
work remains measurable on cancellation or failure. Replacing the displayed snapshot or
destroying the controller cancels its pending paint observation. Geometry-read timings can
include browser layout; the first reader can pay for layout shared by the entire batch.
Development clocks add overhead, so use production browser traces for latency claims.

A prewarmed saved choice should show zero cache misses and zero profile batches. A normal
one-block change with uncached geometry should show one unique miss and one batch. Both
perform pure pagination, reconciliation and one snapshot commit. Investigate actual phase
costs before adding scheduling or incremental page assignment.

## Verification and limits

Build/type checking and edited-file formatting pass. Focused local Chrome inspections
covered the 113-block baseline, all 21 saved concessions in effective/redline views,
paragraph and table continuations, canonical signature-table columns, final spacing,
heading placement, token/provenance conservation and explicit oversized-unit failures.
Production-component fragments matched profile heights without page overflow.

Viewer inspection covered 44 Apply/remove transitions: at most one foreground batch per
transition, zero for a repeated warm choice, and retained DOM/native selection on unchanged
pages. Whole-range authoring across pages, Trigger activation, annotation anchoring,
incremental search, highlights, viewport stability, font invalidation, supersession,
failure retention, retry, cancellation and destruction were inspected separately.
Idle inspection used 29 single-block batches, followed by 42 Apply/remove transitions
with zero foreground batches. It also checked no idle snapshot publication, cancellation,
foreground priority and one concurrent surface call. These are development fixture checks,
not production latency benchmarks or backend/navigation verification. No test suite was added.

Cache-pressure inspection retained all 300 current shapes across repeated resolution and
kept Apply cache-only after warming 170 alternatives. Warming 400 alternatives stopped at
256 optional entries. Changed-block enumeration reduced seed warming from 2,373 preparation
calls to 42 for 29 new shapes. Queued cancellation/supersession skipped obsolete profiling;
failed composition/preparation retained durations and partial counters. All 79 unsplit seed
paragraphs reused their prepared token arrays. Simplified reconciliation retained repeated
pages while rejecting changed intervals, canonical columns and provenance.

Focused telemetry inspection confirmed 113 cold misses in one batch, one miss/batch for
an uncached paragraph edit, and zero for cached and prewarmed transitions. Four missing
block occurrences with two fingerprints required two profiles in one batch. Table-pass
timings, hidden-content cleanup, failed-batch accounting, click timestamps, the 100-sample
limit and unchanged foreground samples during idle warming passed. Edited files pass
Prettier; repository-wide formatting still reports nine unrelated existing files.

Commands and the frozen-reference policy are documented in
[Document projection and composition](overlay-rendering.md#verification). The seed verifier
uses synthetic geometry for semantic and fragment conservation; it cannot establish browser
pagination. Review rendering differences before updating frozen expectations.

## Startup diagnostics

`window.__contractStartupPerf` retains source acceptance timing plus count-only
workspace/renderer/authoring acceptance/profile-surface events. The pure domain's
fixed numeric counters are available under `window.__contractDomainPerf`: record
comparison/recompilation/reuse, projection reuse, geometry entry mutations, queries,
and visited candidates. Take counter differences around a transition. No document
text or backend identifiers are included.

These diagnostics use the existing development / `PUBLIC_CONTRACT_PERF=1` gate.
`__contractColdStart` and `__contractRenderPerf` still separate source acceptance,
viewer/profile mounts, layout epochs, render phases, interaction readiness, and
paint opportunity. They are not a substitute for controlled production traces.

See [domain implementation and verification](document-domain-runtime.md) for current
ownership, work observations, and outstanding checks, and
[cold-start evidence](cold-start-performance.md) for historical browser measurements.
