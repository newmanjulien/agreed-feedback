<script lang="ts">
	import { untrack, onMount, tick } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import { createContractWorkspace, setContractWorkspace } from '$lib/document/runtime/context';
	import type { ContractSourceInput } from '$lib/document/runtime/source.svelte';
	import { recordContractInput } from '$lib/document/runtime/render-perf';
	import { sameSourceRange, snapshotPreviewChanges } from '$lib/document/runtime/types';
	import { env } from '$env/dynamic/public';
	import { useConvexClient } from 'convex-svelte';
	import { AuthoringSession } from '$lib/playbook/authoring.svelte';
	import { convexSaveTransport } from '$lib/playbook/save-transport';
	import type { OperationStatus } from '$lib/components/chrome/operation-status';
	import { AuthoringFlow } from '$lib/playbook/authoring-flow.svelte';
	import ContractViewer from '$lib/components/document/ContractViewer.svelte';
	import SourceSelectionToolbar from '$lib/components/document/SourceSelectionToolbar.svelte';
	import PlaybookEditor from '$lib/components/playbook/PlaybookEditor.svelte';
	import WorkspaceChrome from './WorkspaceChrome.svelte';
	import { setInteractionOwner } from '$lib/components/ui/interactions';
	let { data }: { data: ContractSourceInput } = $props();
	setInteractionOwner(Symbol('authoring-workspace'));
	const workspace = setContractWorkspace(untrack(() => createContractWorkspace(data)));
	const { source, renderer, viewer } = workspace;
	const client = env.PUBLIC_CONVEX_URL ? useConvexClient() : null;
	const authoring = new AuthoringSession(client ? convexSaveTransport(client) : null);
	$effect(() => {
		const { compiled, geometry, geometryVersion, items } = source;
		void geometryVersion;
		untrack(() => authoring.accept(compiled, geometry, items));
	});
	let feedback = $state<OperationStatus | null>(null);
	$effect(() => {
		const completion = authoring.completion;
		feedback = completion
			? { message: completion.kind === 'saved' ? 'Changes saved' : 'Box deleted.' }
			: null;
		if (!completion) return;
		const timer = setTimeout(() => {
			feedback = null;
		}, 2500);
		return () => clearTimeout(timer);
	});
	$effect(() => workspace.accept(data));
	const flow: AuthoringFlow = new AuthoringFlow(authoring, () => ({
		index: source.compiled?.index ?? null,
		geometry: source.geometry,
		items: source.items,
		available: viewer.ready
	}));
	const entry = $derived(flow.entry);
	const draft = $derived(flow.draft);
	const previewConcession = $derived(
		flow.creationConcession ??
			draft?.concessions.find((concession) => concession.id === flow.previewConcessionId)
	);
	const previewChanges = $derived(
		snapshotPreviewChanges(
			previewConcession?.changes.filter((change) =>
				change.replacement.some((atom) => atom.kind === 'reference' || Boolean(atom.text.trim()))
			) ?? []
		)
	);
	// Each selection stays blue until its own replacement participates in the preview.
	const authoringHighlightRanges = $derived(
		flow.selectedRanges.filter(
			(range) => !previewChanges.some((change) => sameSourceRange(range, change.range))
		)
	);
	/** Restore the captured annotation only when an action actually closes the editor. */
	async function runEditorAction(action: () => boolean | Promise<boolean>) {
		const restore = viewer.captureAnnotationFocus?.();
		if (!(await action())) return;
		await tick();
		restore?.();
	}
	function cancel() {
		if (flow.addingConcession) flow.cancelAddition();
		else void runEditorAction(() => flow.cancel());
	}
	function remove() {
		if (!authoring.canDelete) return;
		if (
			!window.confirm(
				'Permanently delete this instruction box? Any unsaved local edits will also be discarded.'
			)
		)
			return;
		void runEditorAction(() => authoring.remove());
		flow.clearFeedback();
	}
	beforeNavigate((navigation) => {
		// Document unload uses the browser warning below, without discarding first.
		if (navigation.willUnload) return;
		if (authoring.unresolved) {
			navigation.cancel();
			flow.editError = 'Resolve the current operation before leaving this instruction box.';
			return;
		}
		if (
			flow.hasUnsavedWork &&
			!window.confirm('Abandon your unsaved instruction-box changes and leave?')
		) {
			navigation.cancel();
			return;
		}
		flow.cancel();
	});
	onMount(() => {
		const warn = (event: BeforeUnloadEvent) => {
			if (!flow.hasUnsavedWork) return;
			event.preventDefault();
			event.returnValue = '';
		};
		window.addEventListener('beforeunload', warn);
		return () => window.removeEventListener('beforeunload', warn);
	});
</script>

<WorkspaceChrome variant="admin" {feedback} />
{#if source.renderSource}
	<main
		oninputcapture={recordContractInput}
		onclickcapture={recordContractInput}
		class="pt-6 pb-12 admin-selection-enabled"
		aria-label="Contract authoring"
	>
		{#snippet panelContent()}{#if entry && source.renderSource}{#key entry.key}<PlaybookEditor
						{flow}
						onCancel={cancel}
						onPrimary={() =>
							runEditorAction(() => (flow.creating ? flow.next() : authoring.save()))}
						onRetry={() => runEditorAction(() => authoring.retry())}
						onDelete={remove}
					/>{/key}{/if}{/snippet}
		{#if !entry && flow.feedback}<p
				class="mx-auto max-w-3xl px-6 text-sm text-danger"
				role="status"
			>
				{flow.feedback}
			</p>{/if}
		<ContractViewer
			hasPanel={Boolean(draft)}
			followScroll={flow.otherClauseActive}
			{panelContent}
			selectedAnnotationId={flow.selectedAnnotationId}
			selectedRanges={authoringHighlightRanges}
			{previewChanges}
			selectedConcessions={{}}
			onRemoveConcession={() => (flow.previewConcessionId = null)}
			panelSource={draft?.triggers[0]?.range.start}
			picking={flow.picking}
			allowPlaybookNavigation={!flow.creating}
			onSelect={(itemId, triggerId) => flow.openItem(itemId, triggerId)}
		/>
	</main>
	{#if renderer.snapshot}<SourceSelectionToolbar
			container={viewer.documentStageElement}
			snapshot={renderer.snapshot}
			enabled={flow.selectionMode !== 'inactive'}
			autoConfirm={flow.picking}
			onSelectionIssue={(issue) => flow.reportIssue(issue)}
			onGestureStart={() => flow.clearFeedback()}
			evaluate={(range) => flow.selectionEligibility(range)}
			onConfirm={(range, mode) => flow.acceptSelection(range, mode)}
		/>{/if}
{:else if source.issue}<p role="alert">
		We couldn’t load this contract. Please refresh to try again.
	</p>
{:else}<p role="status">Loading contract…</p>{/if}
