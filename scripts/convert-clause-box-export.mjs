import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';

const [input, output] = process.argv.slice(2);
if (!input || !output || input === output) {
	throw new Error(
		'Usage: node scripts/convert-clause-box-export.mjs <snapshot.zip|documents.jsonl> <migrated.jsonl>'
	);
}
const source = input.endsWith('.zip')
	? execFileSync('unzip', ['-p', input, 'clauseBoxes/documents.jsonl'], { encoding: 'utf8' })
	: await readFile(input, 'utf8');
const fields = [
	'summary',
	'howToExplainToCustomers',
	'commonObjections',
	'negotiation',
	'changesNeedEscalation'
];
const rows = source
	.trim()
	.split('\n')
	.map((line) => JSON.parse(line));
if (!rows.length || !rows[0]._id)
	throw new Error('Expected a live Convex export with document IDs.');
for (const row of rows) {
	if (
		!row._id ||
		typeof row._creationTime !== 'number' ||
		!row.sections ||
		!Array.isArray(row.summary)
	)
		throw new Error(`Not a legacy clause box: ${row.clauseKey ?? row._id}`);
	const before = { summary: row.summary, ...row.sections };
	for (const field of fields) {
		if (!Array.isArray(before[field]) || before[field].some((value) => typeof value !== 'string'))
			throw new Error(`Invalid legacy copy: ${row.clauseKey} / ${field}`);
		row[field] = before[field].join('\n\n');
	}
	delete row.sections;
}
await writeFile(output, rows.map((row) => JSON.stringify(row)).join('\n') + '\n', { flag: 'wx' });
console.log(
	`Converted ${rows.length} clause boxes, preserving document IDs and paragraph boundaries.`
);
