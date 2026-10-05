# Agreed

A SvelteKit / Svelte 5 contract workspace backed by Convex.

The immutable contract source is separate from the Playbook. A Playbook Item has
one or more Triggers, optional instructions, and negotiation concessions. Each
concession applies an atomic set of source-coordinate Contract Changes.

`/` owns a `RepWorkspace` and `RepPlaybookPanel`. `/admin` owns an `AdminWorkspace`
and `PlaybookEditor`. Both share the document viewer, chrome and rendering
machinery. The viewer receives only the derived document overlay, not instructions,
draft state or save operations.

Admins select unowned source to create an item or click a Trigger to edit its
complete item. One local draft supports instructions, multiple Triggers, preferred
and rare concessions, multiple changes, and structured contract references.
Save validates and submits the complete instruction box; Cancel discards local
changes without writing. Adding a concession to an existing box updates only the
parent draft until that box is saved. Back preserves entered clause selections and
wording. Their concessions
are read-only, including newly added concessions in the draft. Changing a concession
requires deleting it and adding a new one.

Typing, outside clicks, Escape and tab visibility never save. Dirty drafts stay
open until Save, Cancel or confirmed abandonment during navigation. An unresolved
operation blocks editing and internal navigation; Retry sends the same immutable
operation. Rejections keep the draft editable, conflicts offer Use saved version,
and remote deletion is reported explicitly. Save/delete acknowledgments close the
editor and briefly show completion feedback. Delete requires confirmation. Local
drafts are not restored after refresh; browser unload warns while work remains.

Reps can apply one concession per item. Cross-item conflicts are explained and
blocked. Choices are workspace-local and reconcile against live item identities.
The renderer preserves source coordinates and stable prepared tokens, compiles
whole-block browser geometry into cached layout profiles, paginates the complete
document and reconciles unchanged pages before committing one current snapshot.
Saved alternatives can prewarm the normal geometry cache during idle time.
The layout shares pure compiled source and indexed Playbook geometry across routes;
item-aware ingestion keeps metadata-only updates out of rendering. Search discovers
matches from committed page tokens, and annotation owners register by membership.
Search refreshes from snapshot commit IDs. Save, render and
source status remain independently visible above document flow.

## Development

Node.js 22.12 or newer is required.

```sh
npm ci
npm run seed:verify
npx convex dev
```

For a fresh development deployment, run `npm run convex:seed`, set `APP_PASSWORD`
in `.env.local`, and run `npm run dev`. Configure `PUBLIC_CONVEX_URL` for the
backend. The canonical bootstrap data is `data/convex`: 113 immutable blocks and
56 Playbook Items, containing 62 Triggers, 26 concessions and 66 changes.
The seed command refuses to overwrite edited runtime records and resumes an
interrupted items-first import. It is not a migration tool.

Use a fresh deployment for this schema, or explicitly migrate existing data
before pushing it. Existing records and scheduled lifecycle jobs must be handled
by that migration.

## Website gate

The private `APP_PASSWORD` protects website routes using a signed HttpOnly cookie.
It is not Convex authorization: public admin mutations retain the existing access
model. Backend authorization is outside this architectural rewrite.

## Verification

```sh
npm run seed:verify
npm run check
npm run format:check
npm run build
```

`npm run db:audit -- https://YOUR-DEPLOYMENT.convex.cloud` validates a configured
live deployment without comparing deployment-specific IDs to seed IDs. Add `--seed`
to require an exact business-data match to the local seed. The local
verifier uses deterministic row identities only within verification; no second
business identity is stored. It compares all 58 frozen compositor states,
including full source/provenance signatures, pagination token conservation and
server-rendered provenance attributes; see the [reference policy](docs/overlay-rendering.md#verification).

See [workspace ownership](docs/persistent-workspace.md),
[rendering](docs/overlay-rendering.md), [performance](docs/rendering-snappiness.md),
and [editor lifecycle](docs/lifecycle.md).

### Authoring behavior

“Explain a clause” starts a summary draft. “Help reps negotiate” starts a
concession draft. This choice only routes local creation; every saved box exposes
the same editing capabilities. The staged concession itself determines which
creation steps are shown, so no separate mode is serialized or sent to the backend.

The storage schema still accepts the obsolete optional `authoringMode` field on
existing records. It is ignored when editing and removed by the next successful
full-item save. New records omit it. No reseeding is needed. Optional revision
metadata also remains compatible with existing records; deploy the updated Convex
schema and mutations together with the frontend.

Cold-start implementation, rollback flags, recorded evidence, and outstanding production
measurement gates are documented in [the performance report](docs/cold-start-performance.md).

The [document domain implementation report](docs/document-domain-runtime.md) records
ownership, the revision-writer audit, available verification, and open build/browser
gates for the incremental runtime refactor.

## Production-data seed restoration

The cleaned supplied Convex export is retained under `data/migration/source` as the
seed source of truth. These archives have been edited and are not byte-for-byte
originals. `npm run seed:restore-export` deterministically rebuilds both seed
files and the logical mapping. `npm run seed:reconcile` compares every record,
checks edit/save preservation, and compares generated contract output against the
old provision rules. `seed:verify` requires that reconciliation to pass.

Concessions retain optional `detail` and `after` copy; source text retains optional
bold/italic `marks`. These fields are validated, displayed, and preserved by edits.
Read [the reconciliation and cutover report](docs/production-data-reconciliation.md)
before any development rehearsal or production cutover. The development seed guard
is unchanged; it deliberately cannot load production or overwrite an older seed.
