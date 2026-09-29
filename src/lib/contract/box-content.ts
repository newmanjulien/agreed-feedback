import type { ClauseBoxData } from './model';

export function hasPublicContent(box: ClauseBoxData): boolean {
	return Boolean(
		box.summary.trim() ||
		box.howToExplainToBuyers.trim() ||
		box.commonObjections.trim() ||
		box.negotiation.trim() ||
		box.changesNeedEscalation.trim() ||
		box.preferredConcessions.length ||
		box.rareConcessions.length
	);
}
