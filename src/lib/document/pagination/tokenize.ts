import type { ResolvedRun } from '$lib/contract/model';
import type { InlineToken } from './types';

// The browser can wrap after an ASCII hyphen inside a word. Expose that boundary
// while retaining exact source slices/generated offsets; labels/references stay atomic.
const TEXT_CHUNK = /[^\s-]+-?\s*|-\s*|\s+/gu;

export function tokenizeInline(runs: readonly ResolvedRun[]): InlineToken[] {
	return runs.flatMap(({ text, ...metadata }) => {
		// Generated labels/references are atomic even if their displayed text changes length.
		if (metadata.sourceKind === 'number' || metadata.sourceKind === 'reference')
			return text ? [{ ...metadata, value: text }] : [];
		return Array.from(text.matchAll(TEXT_CHUNK), (match) => {
			const value = match[0],
				offset = match.index;
			const source = metadata.source;
			return {
				...metadata,
				value,
				...(metadata.generatedOffset !== undefined
					? { generatedOffset: metadata.generatedOffset + offset }
					: {}),
				...(source && metadata.sourceKind === 'text'
					? {
							source: {
								start: { ...source.start, offset: source.start.offset + offset },
								end: { ...source.end, offset: source.start.offset + offset + value.length }
							}
						}
					: {})
			};
		});
	});
}
