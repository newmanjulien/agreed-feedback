import type { InlineToken } from './pagination/types';

export interface RevisionRun {
	revision: 'normal' | 'removed' | 'added';
	tokens: InlineToken[];
}

export function groupRevisionRuns(tokens: readonly InlineToken[]): RevisionRun[] {
	const runs: RevisionRun[] = [];
	for (const token of tokens) {
		const previous = runs.at(-1);
		const revision = token.revision ?? 'normal';
		if (previous && previous.revision === revision) {
			previous.tokens.push(token);
		} else {
			runs.push({ revision, tokens: [token] });
		}
	}
	return runs;
}
