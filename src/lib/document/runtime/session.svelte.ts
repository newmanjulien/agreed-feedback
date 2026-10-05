import { sameSelection, type ConcessionSelection } from '$lib/playbook/model';

/** Workspace intent, deliberately not persisted across reloads. */
export class ContractWorkspaceSession {
	selectedConcessions = $state.raw<ConcessionSelection>({});
	helpAutoHandled = $state(false);
	toggleConcession(itemId: string, concessionId: string) {
		const next = { ...this.selectedConcessions };
		if (next[itemId] === concessionId) delete next[itemId];
		else next[itemId] = concessionId;
		this.selectedConcessions = next;
	}
	removeConcession(itemId: string) {
		if (!(itemId in this.selectedConcessions)) return;
		const next = { ...this.selectedConcessions };
		delete next[itemId];
		this.selectedConcessions = next;
	}
	reconcile(items: readonly { _id: string; concessions: readonly { id: string }[] }[]) {
		const next = Object.fromEntries(
			Object.entries(this.selectedConcessions).filter(([key, value]) =>
				items.some((item) => item._id === key && item.concessions.some((c) => c.id === value))
			)
		);
		if (!sameSelection(next, this.selectedConcessions)) this.selectedConcessions = next;
	}
}

/** Published by the mounted viewer; consumers share its interaction readiness. */
export class ContractViewerState {
	documentStageElement = $state<HTMLDivElement>();
	retry = $state<() => void>();
	restoreAnnotationFocus = $state<() => void>();
	captureAnnotationFocus = $state<() => () => void>();
	ready = $state(false);
}
