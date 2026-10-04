// Deliberate local-only fixture refresh, gated by exact source reconciliation AND
// independent old provision-rule output checks. Never called by seed:verify.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import { readSeed, reconcile } from './reconcile-production-seed.mjs';
import { normalize, sortedKeys } from './verify-overlay-parity.mjs';
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
	const blocks = await readSeed('contractBlocks'),
		items = await readSeed('playbookItems');
	const report = await reconcile(server, blocks, items);
	assert.equal(report.mismatches.length, 0, 'Refusing to freeze unexplained migration output');
	const { composeContract } = await server.ssrLoadModule('/src/lib/contract/compose.ts');
	const { toDocumentOverlay } = await server.ssrLoadModule('/src/lib/playbook/document-overlay.ts');
	const overlays = items.map((item, i) =>
		toDocumentOverlay({ ...item, _id: `seed-item-${i}`, _creationTime: 0 })
	);
	const previous = JSON.parse(await readFile('data/reference/compositor.json', 'utf8'));
	const states = [...previous];
	for (const [i, item] of items.entries())
		for (const c of item.concessions)
			for (const view of ['effective', 'redline'])
				if (!states.some((s) => s.name === c.id && s.view === view))
					states.push({ name: c.id, view, selected: { [`seed-item-${i}`]: c.id } });
	const hash = (value) =>
		createHash('sha256').update(JSON.stringify(value, sortedKeys)).digest('hex');
	for (const state of states) {
		const rendered = composeContract({
			blocks,
			items: overlays,
			view: state.view,
			activeConcessions: state.selected
		});
		state.sha256 = hash(normalize(rendered));
		state.provenanceSha256 = hash(rendered);
	}
	await writeFile('data/reference/compositor.json', JSON.stringify(states, null, '\t') + '\n');
	console.log(
		`Frozen ${states.length} states after ${report.records.length} record checks and ${report.outputScenarios.length} independent output scenarios. See data/migration/prior-compositor.json for pre-restoration hashes.`
	);
} finally {
	await server.close();
}
