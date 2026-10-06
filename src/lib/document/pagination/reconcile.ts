import type { PageFragment, PaginatedPage } from './types';

export interface PageReconciliation {
	pages: PaginatedPage[];
	/** Includes removed pages so downstream geometry and search caches can discard them. */
	changedPages: number[];
	pagesReused: number;
}

function sameFragment(a: PageFragment, b: PageFragment): boolean {
	if (a.interval?.start !== b.interval?.start || a.interval?.end !== b.interval?.end) return false;
	// The caller has already established immutable prepared content identity.
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

/** Reconcile complete paginator output at the same page positions, never partial work.
 * Prepared objects and their tokens are immutable across requests. Their identity
 * proves content/provenance equality; geometry fingerprints cannot authorize reuse.
 */
export function* iterateReconciledPages(
	candidates: readonly PaginatedPage[],
	layoutEpoch: string,
	previous?: { readonly layoutEpoch: string; readonly pages: readonly PaginatedPage[] }
): Generator<undefined, PageReconciliation> {
	const previousPages = previous?.pages ?? [];
	const sameEpoch = previous?.layoutEpoch === layoutEpoch;
	let pagesReused = 0;
	const pages: PaginatedPage[] = [],
		changedPages: number[] = [];
	for (const [index, candidate] of candidates.entries()) {
		const prior = previousPages[index];
		let same = Boolean(
			sameEpoch &&
			prior &&
			candidate.number === prior.number &&
			candidate.placements.length === prior.placements.length
		);
		for (const [i, placement] of candidate.placements.entries()) {
			if (
				same &&
				(placement.prepared !== prior.placements[i].prepared ||
					!sameFragment(placement.fragment, prior.placements[i].fragment))
			)
				same = false;
			yield undefined;
		}
		if (same) {
			pages.push(prior);
			pagesReused++;
		} else {
			if (!Object.isFrozen(candidate)) {
				for (const placement of candidate.placements) {
					Object.freeze(placement);
					yield undefined;
				}
				Object.freeze(candidate.placements);
				Object.freeze(candidate);
			}
			pages.push(candidate);
			changedPages.push(index + 1);
		}
		yield undefined;
	}
	for (let index = pages.length; index < previousPages.length; index++) {
		changedPages.push(index + 1);
		yield undefined;
	}
	return { pages, changedPages, pagesReused };
}
