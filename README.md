# Agreed

A SvelteKit contract viewer with clause boxes, redlines, document search, and an admin editor.

## Data flow

The protected app layout loads `contract.getBlocks` and `clauseBoxes.list` concurrently through `convexLoad`. Their server results populate the first response; the browser attaches live subscriptions. Domain types and client records come from Convex validators. The local JSONL verifier checks the bootstrap seed baseline. Runtime queries reject duplicate clause keys and invalid block ordering. The read-only `db:audit` command applies the broader semantic checks to the live deployment without requiring its data to match the seed baseline.

`blocks` and selected concession replacements resolve to document runs. The DOM paginator finalizes page 1, displays it, then yields between subsequent completed pages. A generation counter prevents an older run from appending pages after a new selection. Box copy updates only affect the box and public clause availability. A public clause is clickable only if its box has visible text or concessions; the admin can edit an empty box.

Admin drafts and save state exist only on `/admin`. A textarea owns its unsaved value; text edits debounce and tooltip edits send immediately. Saves identify a box by client `id` and compare against the last persisted field value. A newer edit waits behind an in-flight edit to the same field. Mutation results acknowledge writes, report missing boxes and same-field conflicts, and prevent retries from overwriting remote changes. Optimistic updates keep the `clauseBoxes.list` cache current while a save is pending. Blur and page exit start pending saves; leaving the page before an asynchronous save completes can still lose that write. The admin session keeps one Undo for the latest successfully saved copy, tooltip edit, or deletion. The header Undo button stays disabled until an action succeeds. Undoing a copy or tooltip edit compares against the saved value before restoring the prior value; a concurrent change cannot be overwritten. Undoing a deletion restores the server-held box with a new database ID if its clause key is still available. The deletion's one-use undo token stays in this browser session and the server expires saved deletions after seven days. A newer edit or deletion clears the previous Undo, and refreshing the page loses it. Deletion requires confirmation.

Editable summary and instruction fields are strings. Paragraphs are separated by blank lines for public display. The stored text preserves exactly what the editor typed. Concession descriptions and replacements retain their existing shapes.

## Development

Node.js 22.12 or newer is required.

```sh
npm ci
npm run seed:verify
npx convex dev
```

Keep `npx convex dev` running. For a fresh development deployment, in another terminal:

```sh
npm run convex:seed
npm run dev
```

`npx convex dev` writes `CONVEX_DEPLOYMENT` and `PUBLIC_CONVEX_URL` to `.env.local`, generates Convex types, and pushes the schema and functions. Set `APP_PASSWORD` in `.env.local` as well. The seed command imports the bootstrap baseline of 113 blocks and 56 boxes, verifies those records, resumes an interrupted boxes-first import, and refuses to overwrite edited runtime data. Convex is the runtime source of truth. Configure `PUBLIC_CONVEX_URL` and the private `APP_PASSWORD` in Vercel for SSR, subscriptions, and the website gate. The site responds with 503 if `APP_PASSWORD` is missing.

## Website password

The same password opens `/` and `/admin`. Visitors enter it at `/gate`; the server stores a signed, HttpOnly unlock cookie for seven days. Changing `APP_PASSWORD` invalidates existing unlocks. Use a long, private password and do not give the variable a `PUBLIC_` prefix. The gate blocks normal website routes before the contract layout loads. A server load checks the cookie on initial visits and when the browser navigates between app pages. Put future protected pages inside `src/routes/(app)`. It is not authorization for Convex: the browser still calls the admin mutations directly, and those mutations have no access check.

## Historical one-time migration: legacy clause boxes

This procedure applies only to deployments still using the older `sections` shape. The current schema requires strings and stores the four instruction fields at the box root. **Do not seed over an edited deployment.** Pause writes before exporting; the table replacement must use the exact exported snapshot with no intervening edits. Keep writes paused through both schema pushes and the import. Use the same explicit deployment target for every command (`--prod` or `--deployment NAME` as appropriate).

1. Export a backup before changing the schema: `npx convex export --path before-copy-migration.zip --deployment NAME`.
2. Convert the exported box table: `node scripts/convert-clause-box-export.mjs before-copy-migration.zip migrated-clauseBoxes.jsonl`. The converter joins existing paragraphs with two newlines and retains `_id`, `_creationTime`, concessions, and all other box fields. Keep the backup.
3. Temporarily add `{ schemaValidation: false }` as the second argument to `defineSchema(...)` in `src/convex/schema.ts` and push the new backend (`npx convex dev --once` for a dev deployment, or your normal production deployment command). Keep clients paused while old rows still exist.
4. Import only the converted box table with `npx convex import --replace --table clauseBoxes --deployment NAME migrated-clauseBoxes.jsonl`. Convex replaces this table atomically and preserves supplied document IDs; the contract blocks table is untouched. Inspect the import result and count.
5. Remove the temporary `schemaValidation: false` option and push again. Run `npm run seed:verify` to check the local seed baseline, `npm run check` for the app, and `npm run db:audit -- https://YOUR-DEPLOYMENT.convex.cloud` to validate the migrated live records before reopening clients. The audit queries the deployment and never pushes functions or writes data.

For a fresh deployment, no migration is needed. Deploy the final schema and run `npm run convex:seed`.

## Local verification

```sh
npm run seed:verify
npm run check
npm run format:check
npm run build
```

`npm run seed:verify` validates only the local JSONL bootstrap baseline. `npm run db:audit` reads the configured `PUBLIC_CONVEX_URL` from the environment or `.env.local`; pass an explicit Convex URL with `npm run db:audit -- https://YOUR-DEPLOYMENT.convex.cloud` to audit a different deployment. It validates current blocks and boxes, including edited or deleted boxes, without comparing runtime IDs or copy against seed records. The query functions must already be deployed. Browser layout timing and live write behavior require a configured Convex deployment.
