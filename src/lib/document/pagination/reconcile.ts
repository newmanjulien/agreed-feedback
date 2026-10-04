import type { PageFragment, PaginatedPage } from './types';

export interface PageReconciliation {
	pages: PaginatedPage[];
	/** Includes removed pages so downstream geometry and search caches can discard them. */
	changedPages: number[];
	pagesReused: number;
}

function sameFragment(a: PageFragment, b: PageFragment): boolean {
	if (a.interval?.start !== b.interval?.start || a.interval?.end !== b.interval?.end) return false;
	// samePage has already established immutable prepared content identity.
	if (a.type !== 'table' || b.type !== 'table') return true;
	const columns = a.columnWidths;
	const previousColumns = b.columnWidths;
	return (
		columns === previousColumns ||
		(columns !== undefined &&
			previousColumns !== undefined &&
			columns.length === previousColumns.length &&
			columns.every((width, index) => width === previousColumns[index]))
	);
}

function samePage(candidate: PaginatedPage, previous: PaginatedPage): boolean {
	return (
		candidate.number === previous.number &&
		candidate.placements.length === previous.placements.length &&
		candidate.placements.every(
			({ prepared, fragment }, index) =>
				prepared === previous.placements[index].prepared &&
				sameFragment(fragment, previous.placements[index].fragment)
		)
	);
}

/** Reconcile complete paginator output at the same page positions, never partial work.
 * Prepared objects and their tokens are immutable across requests. Their identity
 * proves content/provenance equality; geometry fingerprints cannot authorize reuse.
 */
export function reconcilePages(
	candidates: readonly PaginatedPage[],
	layoutEpoch: string,
	previous?: { readonly layoutEpoch: string; readonly pages: readonly PaginatedPage[] }
): PageReconciliation {
	const previousPages = previous?.pages ?? [];
	const sameEpoch = previous?.layoutEpoch === layoutEpoch;
	let pagesReused = 0;
	const pages = candidates.map((candidate, index) => {
		const prior = previousPages[index];
		if (!sameEpoch || !prior || !samePage(candidate, prior)) return candidate;
		pagesReused++;
		return prior;
	});
	const changedPages: number[] = [];
	for (let index = 0; index < Math.max(pages.length, previousPages.length); index++) {
		if (!sameEpoch || pages[index] !== previousPages[index]) changedPages.push(index + 1);
	}
	return { pages, changedPages, pagesReused };
}
