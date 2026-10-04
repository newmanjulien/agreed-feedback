<script lang="ts">
	import { documentAnnotations } from '$lib/playbook/document-overlay';
	import { untrack } from 'svelte';
	import { createContractWorkspace, setContractWorkspace } from '$lib/document/runtime/context';
	import type { ContractSourceInput } from '$lib/document/runtime/source.svelte';
	import { conflictsForConcession } from '$lib/playbook/selection-conflicts';
	import ContractViewer from '$lib/components/document/ContractViewer.svelte';
	import BoxDismissal from '$lib/components/playbook/BoxDismissal.svelte';
	import RepPlaybookPanel from '$lib/components/playbook/RepPlaybookPanel.svelte';
	import WorkspaceChrome from './WorkspaceChrome.svelte';
	import { recordContractInput } from '$lib/document/runtime/render-perf';
	import { setInteractionOwner } from '$lib/components/ui/interactions';
	let { data }: { data: ContractSourceInput } = $props();
	const interactionOwner = setInteractionOwner(Symbol('rep-workspace'));
	const workspace = setContractWorkspace(untrack(() => createContractWorkspace(data)));
	const { source, session, viewer } = workspace;
	$effect(() => workspace.accept(data));
	let selectedItemId = $state<string | null>(null),
		selectedAnnotationId = $state<string | null>(null);
	const item = $derived(source.items?.find((i) => i._id === selectedItemId));
	$effect(() => {
		if (
			item &&
			selectedAnnotationId &&
			!documentAnnotations(item).some((annotation) => annotation.id === selectedAnnotationId)
		)
			selectedAnnotationId = null;
		if (selectedItemId && !item) {
			selectedItemId = null;
			selectedAnnotationId = null;
		}
	});
	const reasons = $derived.by(() => {
		if (!item || !source.renderSource) return {};
		try {
			return Object.fromEntries(
				item.concessions.map((c) => {
					const blocked = conflictsForConcession(
						source.renderSource!.sourceIndex,
						source.renderSource!.items,
						session.selectedConcessions,
						item._id,
						c.id
					);
					return [
						c.id,
						blocked.length
							? `Remove ${blocked.map((b) => '“' + (source.items?.find((i) => i._id === b.itemId)?.concessions.find((x) => x.id === b.concession.id)?.description ?? 'another concession') + '”').join(' and ')} first.`
							: ''
					];
				})
			);
		} catch {
			return Object.fromEntries(
				item.concessions.map((c) => [c.id, 'Contract source is unavailable.'])
			);
		}
	});
	function toggle(id: string) {
		if (!item) return;
		if (session.selectedConcessions[item._id] !== id && reasons[id]) return;
		session.toggleConcession(item._id, id);
	}
	function close(restoreFocus = true) {
		if (restoreFocus) viewer.restoreAnnotationFocus?.();
		selectedItemId = null;
		selectedAnnotationId = null;
	}
</script>

<BoxDismissal owner={interactionOwner} active={Boolean(item)} onDismiss={close} />

<WorkspaceChrome />
{#if source.renderSource}
	<main onclickcapture={recordContractInput} class="pt-6 pb-12" aria-label="Contract document">
		{#snippet panelContent()}{#if item}<RepPlaybookPanel
					{item}
					selected={session.selectedConcessions[item._id]}
					conflicts={reasons}
					onToggle={toggle}
					onClose={() => close()}
				/>{/if}{/snippet}
		<ContractViewer
			hasPanel={Boolean(item)}
			{panelContent}
			{selectedAnnotationId}
			selectedConcessions={session.selectedConcessions}
			onRemoveConcession={(itemId) => session.removeConcession(itemId)}
			panelSource={item?.triggers[0]?.range.start}
			onSelect={(id, trigger) => {
				selectedItemId = id;
				selectedAnnotationId = trigger;
			}}
		/>
	</main>
{:else if source.issue}<p role="alert">
		We couldn’t load this contract. Please refresh to try again.
	</p>{:else}<p role="status">Loading contract…</p>{/if}
