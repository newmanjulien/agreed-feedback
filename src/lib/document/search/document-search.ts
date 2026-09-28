import { indexDocumentText } from '../dom-text-index';
import type { DocumentSearchResult, TextMatch } from './types';

export function normalizeSearchText(value: string): string {
	return value.trim().replace(/\s+/gu, ' ').toLocaleLowerCase();
}

export function findTextMatches(text: string, query: string): TextMatch[] {
	if (!query) return [];

	const matches: TextMatch[] = [];
	let start = 0;

	while (start <= text.length - query.length) {
		const matchStart = text.indexOf(query, start);
		if (matchStart === -1) break;

		matches.push({ start: matchStart, end: matchStart + query.length });
		start = matchStart + query.length;
	}

	return matches;
}

export function searchDocument(root: HTMLElement, rawQuery: string): DocumentSearchResult[] {
	const query = normalizeSearchText(rawQuery);
	if (!query) return [];

	const results: DocumentSearchResult[] = [];

	for (const block of indexDocumentText(root, { lowercase: true })) {
		for (const match of findTextMatches(block.text, query)) {
			const start = block.starts[match.start];
			const end = block.ends[match.end - 1];
			if (!start || !end) continue;

			const range = root.ownerDocument.createRange();
			range.setStart(start.node, start.offset);
			range.setEnd(end.node, end.offset);
			results.push({ range });
		}
	}

	return results;
}
