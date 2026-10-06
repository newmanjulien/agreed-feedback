# Lightweight performance checks

Run `npm run test:perf` once for all three groups. Use this same command when CI is
introduced; no CI configuration is currently added. Vitest runs saving tests in
the edge runtime through `convex-test`, and scheduling/cache tests in Node with
controlled browser callbacks and fake IndexedDB. Fixtures are synthetic; no browser
harness, backend, seed data, or elapsed-time thresholds are required.

Run `npm run verify` to run the performance suite followed by the type checks and
production build.

| Group      | Automated guarantees                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Saving     | Identical selections return success without snapshot queries, compilation, or writes, preserving `savedAt`, revision, and `lastOperationId`. Changed zero/one-selection saves skip baseline reads and compilation, validate membership, and advance state. Replays succeed; stale saves conflict; invalid operations/revisions and missing contracts retain their behavior. A changed two-selection save confirms the read/compiler observers execute real code. |
| Scheduling | Foreground dispatches before queued background work. Aborted queued callbacks never run. Destroy rejects queued work and cancels dispatch.                                                                                                                                                                                                                                                                                                                       |
| Caching    | A network snapshot reopens from memory without another request, then from IndexedDB after memory release without downloading. Confirmed state updates survive reopening without rewriting the immutable snapshot store.                                                                                                                                                                                                                                          |

Unchanged saves do not consume operation IDs: repeating one at the same revision
remains a no-op, and repeating it after an intervening change follows conflict rules.
This intentionally differs from changed saves, which advance revision and record
the operation. The mutation response shape is unchanged.

Tests observe work at database/compiler/storage boundaries, retain real
implementations, and restore timers, globals, cache ownership, and isolated storage.
They do not cover candidate deduplication, preparation retention/eviction, autosave
races, cache migrations, exhaustive failures, document reuse, subscription
ownership, or search/geometry.
