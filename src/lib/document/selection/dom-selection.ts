import type { SourceRange, SourcePoint } from '$lib/contract/source-model';
import { comparePoints, unitsInRange, validateRange } from '$lib/contract/ranges';
import { pointPosition, resolvePoint, type SourceIndex } from '$lib/contract/source-index';

/** Resolve source coordinates into visible text ranges, including fragments split across pages. */
export function sourceRangeToDomRanges(
	root: HTMLElement,
	range: SourceRange,
	index: SourceIndex
): Range[] {
	let start: number, end: number;
	try {
		start = pointPosition(index, range.start);
		end = pointPosition(index, range.end);
	} catch {
		return [];
	}
	if (start >= end) return [];
	const ranges: Range[] = [];
	let current: Range | undefined;
	let block: Element | null = null;
	const blockKeys = new Set(unitsInRange(index, range).map((unit) => unit.blockKey));
	const selector = [...blockKeys]
		.flatMap((key) => [
			`[data-block-key="${CSS.escape(key)}"] [data-source-start-key]`,
			`[data-block-key="${CSS.escape(key)}"] [data-generated]`
		])
		.join(',');
	if (!selector) return [];
	for (const span of root.querySelectorAll<HTMLElement>(selector)) {
		const nextBlock = span.closest('td, th, .contract-block');
		if (nextBlock !== block) current = undefined;
		block = nextBlock;
		if (span.closest('[data-revision], del, ins, [aria-hidden="true"]')) {
			current = undefined;
			continue;
		}
		// Bridge separators only when selected source text follows in the same block.
		if (span.dataset.generated === 'separator') continue;
		if (span.dataset.generated) {
			current = undefined;
			continue;
		}
		const unit = index.byKey.get(span.dataset.sourceStartKey!);
		const text = span.firstChild;
		const from = Number(span.dataset.sourceStartOffset),
			to = Number(span.dataset.sourceEndOffset);
		if (
			!unit ||
			span.dataset.sourceEndKey !== unit.sourceKey ||
			!text ||
			text.nodeType !== Node.TEXT_NODE ||
			!Number.isSafeInteger(from) ||
			!Number.isSafeInteger(to) ||
			from < 0 ||
			to > unit.length ||
			from >= to
		) {
			current = undefined;
			continue;
		}
		const overlapStart = Math.max(start, unit.position + from),
			overlapEnd = Math.min(end, unit.position + to);
		if (overlapStart >= overlapEnd) {
			current = undefined;
			continue;
		}
		const length = text.textContent?.length ?? 0;
		if (unit.kind === 'text' && length !== to - from) {
			current = undefined;
			continue;
		}
		if (!current) {
			current = root.ownerDocument.createRange();
			current.setStart(text, unit.kind === 'text' ? overlapStart - unit.position - from : 0);
			ranges.push(current);
		}
		current.setEnd(text, unit.kind === 'text' ? overlapEnd - unit.position - from : length);
	}
	return ranges;
}

/** Map the complete DOM interval, including unselectable revisions between endpoints.
 * Partial atomic labels and generated endpoints are rejected, never silently trimmed.
 */
export function mapSelection(
	selection: Selection,
	root: HTMLElement,
	index: SourceIndex
): SourceRange | null {
	if (selection.rangeCount !== 1 || selection.isCollapsed) return null;
	const range = selection.getRangeAt(0);
	if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
	const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	let first: SourceRange['start'] | undefined, last: SourceRange['end'] | undefined;
	let startsWithSeparator = false,
		endsWithSeparator = false;
	try {
		for (let node = walker.nextNode(); node; node = walker.nextNode()) {
			const text = node as Text;
			const start =
				range.startContainer === text
					? range.startOffset
					: range.comparePoint(text, 0) >= 0
						? 0
						: text.length;
			const end =
				range.endContainer === text
					? range.endOffset
					: range.comparePoint(text, text.length) <= 0
						? text.length
						: 0;
			if (start >= end) continue;
			const parent = text.parentElement;
			if (parent?.closest('[aria-hidden="true"]')) continue;
			// Template whitespace between pages/blocks has no contract identity.
			if (!text.data.trim() && !parent?.closest('.contract-block')) continue;
			if (!parent?.closest('.contract-document') || parent.closest('[data-revision], del, ins'))
				return null;
			const span = parent.closest<HTMLElement>('[data-source-start-key], [data-generated]');
			if (!span || span.textContent !== text.data) return null;
			if (span.dataset.generated) {
				if (span.dataset.generated !== 'separator') return null;
				if (!first) startsWithSeparator = true;
				endsWithSeparator = true;
				continue;
			}
			const key = span.dataset.sourceStartKey;
			const from = Number(span.dataset.sourceStartOffset),
				to = Number(span.dataset.sourceEndOffset);
			if (
				!key ||
				key !== span.dataset.sourceEndKey ||
				!Number.isSafeInteger(from) ||
				!Number.isSafeInteger(to)
			)
				return null;
			const unit = resolvePoint(index, { sourceKey: key, offset: from });
			resolvePoint(index, { sourceKey: key, offset: to });
			if (unit.kind !== span.dataset.sourceKind) return null;
			if (unit.kind !== 'text' && (start !== 0 || end !== text.length || from !== 0 || to !== 1))
				return null;
			if (
				unit.kind === 'text' &&
				(to - from !== text.length || unit.displayText.slice(from, to) !== text.data)
			)
				return null;
			const a = { sourceKey: key, offset: unit.kind === 'text' ? from + start : 0 };
			const b = { sourceKey: key, offset: unit.kind === 'text' ? from + end : 1 };
			if (last && comparePoints(index, last, a) > 0) return null;
			first ??= a;
			last = b;
			endsWithSeparator = false;
		}
		if (!first || !last || startsWithSeparator || endsWithSeparator) return null;
		const canonical = { start: first, end: last };
		validateRange(index, canonical);
		return canonical;
	} catch {
		return null;
	}
}

export interface SourceOccurrencePreference {
	pageNumber: number;
	fragmentIdentity: string;
}

export function sourceOccurrence(span: HTMLElement): SourceOccurrencePreference {
	const block = span.closest<HTMLElement>('[data-source-fragment-key]');
	const cell = span.closest<HTMLTableCellElement>('td, th');
	return {
		pageNumber: Number(span.closest<HTMLElement>('.document-page')?.dataset.pageNumber),
		fragmentIdentity: `${block?.dataset.blockKey ?? ''}:${cell?.dataset.sourceRow ?? ''}:${cell?.dataset.sourceCell ?? ''}`
	};
}

/** Locate a source point again after panel layout or pagination changes. */
export function sourcePointBounds(
	root: HTMLElement,
	point: SourcePoint,
	includeRemoved = false,
	preference?: SourceOccurrencePreference
): DOMRect | null {
	const spans = Array.from(
		root.querySelectorAll<HTMLElement>(`[data-source-start-key="${CSS.escape(point.sourceKey)}"]`)
	);
	if (preference)
		spans.sort((a, b) => {
			const rank = (span: HTMLElement) => {
				const occurrence = sourceOccurrence(span);
				const distance = Math.abs(occurrence.pageNumber - preference.pageNumber);
				return distance === 0 && occurrence.fragmentIdentity === preference.fragmentIdentity
					? -1
					: distance;
			};
			return rank(a) - rank(b);
		});
	for (const span of spans) {
		const from = Number(span.dataset.sourceStartOffset),
			to = Number(span.dataset.sourceEndOffset);
		if (
			span.dataset.sourceStartKey !== point.sourceKey ||
			(span.dataset.revision && !(includeRemoved && span.dataset.revision === 'removed')) ||
			point.offset < from ||
			point.offset > to
		)
			continue;
		const text = span.firstChild;
		if (span.dataset.sourceKind === 'text' && text?.nodeType === Node.TEXT_NODE) {
			const caret = root.ownerDocument.createRange();
			caret.setStart(text, Math.min(point.offset - from, text.textContent?.length ?? 0));
			caret.collapse(true);
			const bounds = caret.getClientRects()[0];
			if (bounds?.height) return bounds;
		}
		const bounds = span.getBoundingClientRect();
		if (bounds.height) return bounds;
	}
	return null;
}
