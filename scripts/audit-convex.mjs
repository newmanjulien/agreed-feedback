import assert from 'node:assert/strict';
import { readSeed, differences } from './reconcile-production-seed.mjs';
import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';
import { createServer } from 'vite';
import { configuredEnv } from './convex-env.mjs';

const args = process.argv.slice(2);
const exactSeed = args.includes('--seed');
const positional = args.filter((arg) => arg !== '--seed');
if (positional.length > 1 || positional.some((arg) => arg.startsWith('--')))
	throw new Error('Usage: npm run db:audit -- [--seed] [CONVEX_URL]');
const url = positional[0] ?? (await configuredEnv('PUBLIC_CONVEX_URL')).PUBLIC_CONVEX_URL;
if (!url) throw new Error('Set PUBLIC_CONVEX_URL or pass a Convex URL to db:audit.');
const client = new ConvexHttpClient(url);
const [blocks, records] = await Promise.all([
	client.query(anyApi.contract.getBlocks, {}),
	client.query(anyApi.playbookItems.list, {})
]);
// Operation receipts/revisions are transport state, not source business data.
const items = records.map(
	({ _id, _creationTime, revision, lastOperationId, authoringMode, ...item }) => item
);
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
	const { validatePlaybook } = await server.ssrLoadModule('/src/lib/playbook/audit.ts');
	validatePlaybook(blocks, items);
	if (exactSeed) {
		const expectedBlocks = await readSeed('contractBlocks');
		const expectedItems = await readSeed('playbookItems');
		const identity = (item) => JSON.stringify(item.triggers.map((trigger) => trigger.id));
		const actualByIdentity = new Map(items.map((item) => [identity(item), item]));
		assert.equal(actualByIdentity.size, items.length, 'Duplicate logical item identity');
		assert.equal(items.length, expectedItems.length, 'Live item count differs from seed');
		const aligned = expectedItems.map((item) => actualByIdentity.get(identity(item)));
		const mismatches = [
			...differences(expectedBlocks, blocks, 'contractBlocks'),
			...differences(expectedItems, aligned, 'playbookItems')
		];
		assert.equal(mismatches.length, 0, JSON.stringify(mismatches.slice(0, 20), null, 2));
		console.log(
			'Exact seed reconciliation passed: 0 business-data mismatches (Convex IDs and transport metadata excluded).'
		);
	}
	console.log(
		`Live contract valid at ${new URL(url).host}: ${blocks.length} blocks, ${items.length} items, ${items.reduce((count, box) => count + box.concessions.length, 0)} concessions.`
	);
} finally {
	await server.close();
}
