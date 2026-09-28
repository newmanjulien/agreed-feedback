import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

async function readRows(table) {
	const source = (await readFile(`data/convex/${table}.jsonl`, 'utf8')).trim();
	if (!source) throw new Error(`${table} has no import records.`);
	return source.split('\n').map(JSON.parse);
}

const contract = {
	blocks: await readRows('contractBlocks'),
	boxes: await readRows('clauseBoxes')
};
assert.deepStrictEqual(
	contract.boxes.map((box) => box.clauseKey),
	contract.boxes.map((box) => box.clauseKey).sort(),
	'Clause box import records must be sorted by clause key.'
);

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
	const { validateContract } = await server.ssrLoadModule('/src/lib/contract/validate.ts');
	validateContract(contract);
	console.log(
		`Seed contract valid: ${contract.blocks.length} blocks, ${contract.boxes.length} boxes, ${contract.boxes.reduce((count, box) => count + box.preferredConcessions.length + box.rareConcessions.length, 0)} concessions.`
	);
} finally {
	await server.close();
}
