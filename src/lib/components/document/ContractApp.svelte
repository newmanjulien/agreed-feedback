<script lang="ts">
	import { onMount } from 'svelte';
	import AppChrome from '$lib/components/chrome/AppChrome.svelte';
	import type { ClauseBoxRecord, ContractBlock } from '$lib/contract/model';
	import GuideModal from '$lib/components/ui/modal/GuideModal.svelte';
	import type { GuideVariant } from '$lib/components/ui/modal/guide-content';
	import { isGuideHidden } from '$lib/components/ui/modal/guide-storage';
	import ContractViewer from './ContractViewer.svelte';
	import type { AdminPersistence } from '$lib/admin/persistence.svelte';

	let {
		blocks,
		boxes,
		adminEdits,
		guideVariant = 'rep'
	}: {
		blocks: ContractBlock[];
		boxes: ClauseBoxRecord[];
		adminEdits?: AdminPersistence;
		guideVariant?: GuideVariant;
	} = $props();
	let documentStageElement = $state<HTMLDivElement>();
	let guideVisible = $state(false);
	onMount(() => {
		guideVisible = !isGuideHidden(guideVariant);
	});
</script>

<AppChrome
	headerText={adminEdits ? 'Edit the guidance your reps see (beta)' : undefined}
	feedback={adminEdits?.feedback}
	undo={adminEdits?.undo}
	onUndo={adminEdits ? () => void adminEdits.undoEdit() : undefined}
	onDismissFeedback={(id) => adminEdits?.dismissNotice(id)}
	onDiscardConflict={(id, field) => adminEdits?.discardConflict(id, field)}
	onRetryFailedEdit={(id, field) => adminEdits?.retry(id, field)}
	searchTarget={documentStageElement}
	onOpenGuide={() => (guideVisible = true)}
/>
{#if guideVisible}<GuideModal variant={guideVariant} onClose={() => (guideVisible = false)} />{/if}
<main
	class="workspace block min-w-full pt-6 pb-12 max-[650px]:pt-3.5 max-[650px]:pb-8"
	aria-label="Contract document"
>
	<ContractViewer {blocks} {boxes} {adminEdits} bind:documentStageElement />
</main>
