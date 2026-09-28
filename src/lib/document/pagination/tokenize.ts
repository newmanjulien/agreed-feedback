import type { ResolvedRun } from '$lib/contract/model';
import type { InlineToken } from './types';

const TEXT_CHUNK = /\S+\s*|\s+/gu;

export function tokenizeInline(runs: readonly ResolvedRun[]): InlineToken[] {
	return runs.flatMap((run) =>
		(run.text.match(TEXT_CHUNK) ?? []).map((value) => ({
			value,
			...(run.clauseKey ? { clauseKey: run.clauseKey, occurrenceKey: run.occurrenceKey } : {}),
			...(run.revision ? { revision: run.revision } : {}),
			...(run.marks ? { marks: { ...run.marks } } : {})
		}))
	);
}
