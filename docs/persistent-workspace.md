# Workspace ownership

The app layout configures Convex and owns two independent contexts:

- `DocumentDomain`: pure accepted baseline and Playbook semantics, compiled source,
  indexed geometry, reusable item projections, publication revisions, and work counters.
- `ContractLayoutProfiles`: the existing hidden profiling surface and bounded
  browser geometry cache, keyed by geometry fingerprint and live layout epoch.

Neither context retains a complete render snapshot, view intent, native selection,
search state, authoring operation, or renderer. They are scoped to the layout,
never a module-global cache or a shared SSR session.

`RepWorkspace` and `AdminWorkspace` each own their route-local source publication,
concession intent, renderer, and reactive viewer state. Admin also owns its
`AuthoringSession` and `AuthoringFlow`; drafts/operations do not survive route
teardown. Explicit Save, navigation guards, and unresolved-operation handling are
unchanged. Geometry sharing cannot display the previous route's snapshot.

`ContractSourceController` accepts current query data into the domain and publishes
one render source per changed semantic revision. Unchanged item projections retain
identity. Metadata-only updates refresh business content without changing the
render source. Ordering and baseline changes still advance rendering identity.
Query failures retain accepted data. The initial reactive replay is skipped only
when all four query data/error references match the synchronous acceptance.

`ContractWorkspaceSession` addresses selections by item/concession ID and removes
missing choices against accepted records. Rep choices remain local. Admin previews
the concession under creation or the last locally added concession, with whole-range
draft changes; acknowledgement ends that preview. Other unsaved edits do not alter
the rendered contract. The viewer receives view intent explicitly.

`ContractViewer` owns committed interaction gating, generic panel positioning,
annotation registration, and DOM callbacks. It publishes readiness only when the
snapshot matches source, intent, and layout epoch with no pending work/error/conflict.
Teardown clears callbacks, registrations, observers, and its route-local renderer.
Focus restoration preserves semantic source/generated-character coordinates.

`ContractRenderController` serializes requests and retains the last complete
same-view snapshot on cancellation/failure. The compositor still owns activation,
numbering/reference closure, and exact dirty-container logic. The layout profiler
serializes foreground/idle browser measurement and rejects stale epochs.
`PUBLIC_CONTRACT_ROUTE_PROFILES=0` restores the viewer-owned fallback; standalone
viewers also use it. No page/typography/pagination behavior was changed.

Chrome owns the search session and input/panel references. Search discovery uses
committed page tokens and semantic positions; DOM ranges are materialized for
mounted matches after a commit. Closing clears results and highlights and restores
focus to a visible search trigger. Escape prioritizes modal, search, then editor.
Source picking uses the domain index only while displayed provenance is current.

See [domain implementation and verification](document-domain-runtime.md),
[editor lifecycle](lifecycle.md), and the historical
[cold-start performance evidence](cold-start-performance.md).
