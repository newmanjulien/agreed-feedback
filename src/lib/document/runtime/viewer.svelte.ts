/** Published by the mounted viewer; consumers share its interaction readiness. */
export class ContractViewerState {
	documentStageElement = $state<HTMLDivElement>();
	retry = $state<() => void>();
	restoreAnnotationFocus = $state<() => void>();
	captureAnnotationFocus = $state<() => () => void>();
	ready = $state(false);
	prepared = $state(false);
	visible = $state(false);
	preparationBlocked = $state(false);
}
