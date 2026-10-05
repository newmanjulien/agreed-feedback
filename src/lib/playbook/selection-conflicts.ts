import type { DocumentOverlayItem } from './document-overlay';
import type { SourceIndex } from '../contract/source-index';
import type { ConcessionSelection } from './model';
import { createChangeConflictChecker } from './conflicts';
export function selectedItems(
	items: readonly DocumentOverlayItem[],
	selection: ConcessionSelection
) {
	return items.flatMap((item) => {
		const selected = selection[item.itemId];
		if (selected === undefined) return [];
		const concession = item.concessions.find((c) => c.id === selected);
		return concession ? [{ itemId: item.itemId, concession }] : [];
	});
}
export function conflictsForConcession(
	index: SourceIndex,
	items: readonly DocumentOverlayItem[],
	selection: ConcessionSelection,
	itemId: string,
	concessionId: string
) {
	const candidate = items
		.find((i) => i.itemId === itemId)
		?.concessions.find((c) => c.id === concessionId);
	if (!candidate) return [];
	const conflicts = createChangeConflictChecker(index);
	return selectedItems(items, selection).filter(
		(a) =>
			a.itemId !== itemId &&
			candidate.changes.some((x) => a.concession.changes.some((y) => conflicts(x, y)))
	);
}
export function activeConflicts(
	index: SourceIndex,
	items: readonly DocumentOverlayItem[],
	selection: ConcessionSelection
) {
	const active = selectedItems(items, selection);
	const conflicts = createChangeConflictChecker(index);
	return active.filter((a, i) =>
		active.some(
			(b, j) =>
				i !== j &&
				a.concession.changes.some((x) => b.concession.changes.some((y) => conflicts(x, y)))
		)
	);
}
