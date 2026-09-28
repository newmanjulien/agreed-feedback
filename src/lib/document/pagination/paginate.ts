import type { ResolvedBlock } from '$lib/contract/model';
import { tokenizeInline } from './tokenize';
import type {
	HeadingFragment,
	InlineToken,
	PageFragment,
	PageLayout,
	ParagraphFragment,
	PageMeasurement,
	TableFragment
} from './types';

function paragraphFragment(
	blockKey: string,
	tokens: InlineToken[],
	start: number,
	end: number,
	emptyInsertionSlot = false
): ParagraphFragment {
	return {
		type: 'paragraph',
		blockKey,
		tokens: tokens.slice(start, end),
		isContinuation: start > 0,
		isFinal: end === tokens.length,
		emptyInsertionSlot
	};
}

function headingPreview(
	blocks: readonly ResolvedBlock[],
	blockIndex: number
): ParagraphFragment | undefined {
	const next = blocks[blockIndex + 1];
	if (!next || next.kind !== 'paragraph') return undefined;

	const tokens = tokenizeInline(next.content);
	if (tokens.length === 0) return undefined;
	return paragraphFragment(next.blockKey, tokens, 0, Math.min(tokens.length, 4));
}

function largestFittingParagraphEnd(
	blockKey: string,
	tokens: InlineToken[],
	start: number,
	pageFragments: PageFragment[],
	pageIndex: number,
	measurement: PageMeasurement
): number {
	let low = start + 1;
	let high = tokens.length - 1;
	let best = start;

	while (low <= high) {
		const middle = Math.floor((low + high) / 2);
		const candidate = paragraphFragment(blockKey, tokens, start, middle);
		if (measurement.fits([...pageFragments, candidate], pageIndex)) {
			best = middle;
			low = middle + 1;
		} else {
			high = middle - 1;
		}
	}

	return best;
}

export function* paginateDocument(
	blocks: readonly ResolvedBlock[],
	measurement: PageMeasurement
): Generator<PageLayout> {
	let page: PageLayout = { number: 1, fragments: [] };
	const currentPage = () => page;
	function* newPage(): Generator<PageLayout> {
		if (!page.fragments.length)
			throw new Error('Pagination attempted to create two empty pages in a row.');
		yield page;
		page = { number: page.number + 1, fragments: [] };
	}

	for (const [blockIndex, block] of blocks.entries()) {
		const blockKey = block.blockKey;
		if (block.kind === 'heading') {
			const heading: HeadingFragment = {
				type: 'heading',
				blockKey,
				anchor: block.anchor,
				level: block.level,
				tokens: tokenizeInline(block.content)
			};
			const preview = headingPreview(blocks, blockIndex);
			const keepTogether = preview ? [heading, preview] : [heading];

			if (
				currentPage().fragments.length > 0 &&
				!measurement.fits([...currentPage().fragments, ...keepTogether], page.number - 1)
			) {
				yield* newPage();
			}

			if (!measurement.fits([...currentPage().fragments, heading], page.number - 1)) {
				throw new Error(`Heading "${block.anchor}" does not fit on an empty page.`);
			}

			currentPage().fragments.push(heading);
			continue;
		}

		if (block.kind === 'table') {
			const table: TableFragment = {
				type: 'table',
				blockKey,
				variant: block.variant,
				headerRowCount: block.headerRowCount,
				rows: block.rows.map((row) => row.map((cell) => ({ tokens: tokenizeInline(cell.content) })))
			};
			const fits = (fragment: TableFragment) =>
				measurement.fits([...currentPage().fragments, fragment], page.number - 1);
			if (fits(table)) {
				currentPage().fragments.push(table);
				continue;
			}
			if (currentPage().fragments.length && measurement.fits([table], page.number)) {
				yield* newPage();
				currentPage().fragments.push(table);
				continue;
			}

			const headers = table.rows.slice(0, table.headerRowCount);
			const body = table.rows.slice(table.headerRowCount);
			if (!body.length) {
				if (currentPage().fragments.length) yield* newPage();
				if (!fits(table)) throw new Error(`Table header in "${blockKey}" exceeds a page.`);
				currentPage().fragments.push(table);
				continue;
			}
			for (let start = 0; start < body.length;) {
				const fragment = (end: number): TableFragment => ({
					...table,
					rows: [...headers, ...body.slice(start, end)]
				});
				let end = start + 1;
				if (!fits(fragment(end))) {
					if (currentPage().fragments.length) yield* newPage();
					if (!fits(fragment(end)))
						throw new Error(`A row in "${blockKey}" exceeds an empty page.`);
				}
				while (end < body.length && fits(fragment(end + 1))) end++;
				currentPage().fragments.push(fragment(end));
				start = end;
				if (start < body.length) yield* newPage();
			}
			continue;
		}

		const tokens = tokenizeInline(block.content);
		let start = 0;

		while (start < tokens.length) {
			const complete = paragraphFragment(
				blockKey,
				tokens,
				start,
				tokens.length,
				block.emptyInsertionSlot
			);
			if (measurement.fits([...currentPage().fragments, complete], page.number - 1)) {
				currentPage().fragments.push(complete);
				start = tokens.length;
				continue;
			}

			const end = largestFittingParagraphEnd(
				blockKey,
				tokens,
				start,
				currentPage().fragments,
				page.number - 1,
				measurement
			);

			if (end === start) {
				if (currentPage().fragments.length === 0) {
					throw new Error(`A token in "${blockKey}" is wider or taller than an empty page.`);
				}
				yield* newPage();
				continue;
			}

			currentPage().fragments.push(paragraphFragment(blockKey, tokens, start, end));
			start = end;
			yield* newPage();
		}
	}

	if (page.fragments.length) yield page;
}
