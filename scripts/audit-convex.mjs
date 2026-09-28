import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';
import { createServer } from 'vite';
import { configuredEnv } from './convex-env.mjs';

if (process.argv.length > 3) throw new Error('Usage: npm run db:audit -- [CONVEX_URL]');
const url = process.argv[2] ?? (await configuredEnv('PUBLIC_CONVEX_URL')).PUBLIC_CONVEX_URL;
if (!url) throw new Error('Set PUBLIC_CONVEX_URL or pass a Convex URL to db:audit.');
const client = new ConvexHttpClient(url);
const [blocks, records] = await Promise.all([
	client.query(anyApi.contract.getBlocks, {}),
	client.query(anyApi.clauseBoxes.list, {})
]);
const boxes = records.map(({ id, ...box }) => box);
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
	const { validateContract } = await server.ssrLoadModule('/src/lib/contract/validate.ts');
	validateContract({ blocks, boxes });
	console.log(
		`Live contract valid at ${new URL(url).host}: ${blocks.length} blocks, ${boxes.length} boxes, ${boxes.reduce((count, box) => count + box.preferredConcessions.length + box.rareConcessions.length, 0)} concessions.`
	);
} finally {
	await server.close();
}
