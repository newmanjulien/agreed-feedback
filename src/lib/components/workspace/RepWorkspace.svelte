<script lang="ts">
	import { documentAnnotations } from '$lib/playbook/document-overlay';
	import { onDestroy, untrack } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import type { Doc, Id } from '../../../convex/_generated/dataModel';
	import { saveError, type ContractSnapshot, type SavedSelections } from '$lib/contract/saved';
	import { sameSelection } from '$lib/playbook/model';
	import CompanyNameDialog from '$lib/components/ui/modal/CompanyNameDialog.svelte';
	import type { OperationStatus } from '$lib/components/chrome/operation-status';
	import { createContractWorkspace, setContractWorkspace } from '$lib/document/runtime/context';
	import { conflictsForConcession } from '$lib/playbook/selection-conflicts';
	import ContractViewer from '$lib/components/document/ContractViewer.svelte';
	import BoxDismissal from '$lib/components/playbook/BoxDismissal.svelte';
	import RepPlaybookPanel from '$lib/components/playbook/RepPlaybookPanel.svelte';
	import WorkspaceChrome from './WorkspaceChrome.svelte';
	import { recordContractInput } from '$lib/document/runtime/render-perf';
	import { setInteractionOwner } from '$lib/components/ui/interactions';
	let {
		snapshot,
		initialContract,
		onSaved
	}: {
		snapshot: ContractSnapshot;
		initialContract?: Doc<'savedContracts'>;
		onSaved: (id: Id<'savedContracts'>) => Promise<boolean>;
	} = $props();
	const interactionOwner = setInteractionOwner(Symbol('rep-workspace'));
	const workspace = setContractWorkspace(
		untrack(() =>
			createContractWorkspace({
				blocks: { data: snapshot.blocks },
				items: { data: snapshot.items }
			})
		)
	);
	const { source, session, viewer } = workspace;
	const client = useConvexClient();
	let active = true;
	onDestroy(() => {
		active = false;
	});
	let contractId = $state(untrack(() => initialContract?._id));
	let localCompanyName = $state(untrack(() => initialContract?.companyName ?? null));
	let savedSelection = $state.raw<SavedSelections>(
		untrack(() => initialContract?.selectedConcessions ?? {})
	);
	untrack(() => {
		session.selectedConcessions = savedSelection;
	});
	const metadata = useQuery(api.savedContracts.metadata, () =>
		contractId ? { id: contractId } : 'skip'
	);
	const companyName = $derived(metadata.data?.companyName ?? localCompanyName);
	const deleted = $derived(Boolean(contractId && metadata.data === null));
	let saving = $state(false);
	let naming = $state(false);
	let error = $state<string | null>(null);
	let feedback = $state<OperationStatus | null>(null);
	const dirty = $derived(
		!contractId || !sameSelection(session.selectedConcessions, savedSelection)
	);
	const canSave = $derived(dirty && Boolean(source.renderSource) && !deleted);
	$effect(() => {
		if (!feedback || feedback.urgent) return;
		const timer = setTimeout(() => (feedback = null), 3000);
		return () => clearTimeout(timer);
	});
	async function finishSave(id: Id<'savedContracts'>) {
		let opened = false;
		try {
			opened = await onSaved(id);
		} catch {
			// The mutation already committed; navigation failure is independently retryable.
		}
		if (active)
			feedback = opened
				? { message: 'Contract saved' }
				: {
						message: 'Contract saved, but we couldn’t update its URL. Try again.',
						urgent: true,
						actions: [{ label: 'Try again', run: () => void finishSave(id) }]
					};
	}
	async function save(name?: string) {
		if (saving || !canSave) return;
		if (!contractId && !name) {
			error = null;
			naming = true;
			return;
		}
		saving = true;
		error = null;
		feedback = null;
		// Capture the submitted choices; edits made during the request remain dirty.
		const selectedConcessions = { ...session.selectedConcessions } as SavedSelections;
		let savedId: Id<'savedContracts'> | undefined;
		try {
			const saved = contractId
				? await client.mutation(api.savedContracts.save, { id: contractId, selectedConcessions })
				: await client.mutation(api.savedContracts.create, {
						companyName: name!,
						snapshot,
						selectedConcessions
					});
			contractId = saved._id;
			localCompanyName = saved.companyName;
			savedSelection = selectedConcessions;
			naming = false;
			savedId = saved._id;
		} catch (cause) {
			error = saveError(
				cause,
				'We couldn’t save this contract. Your changes are still here. Try again.'
			);
			if (!naming)
				feedback = {
					message: error,
					urgent: true,
					actions: [{ label: 'Try again', run: () => void save() }]
				};
		} finally {
			if (savedId && active) await finishSave(savedId);
			saving = false;
		}
	}
	beforeNavigate((navigation) => {
		if (navigation.to?.url.pathname === `/contracts/${contractId}` && navigation.type === 'goto')
			return;
		if (!dirty && !saving) return;
		if (
			navigation.type === 'leave' ||
			!window.confirm('Leave this contract and discard unsaved changes?')
		)
			navigation.cancel();
	});
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

<WorkspaceChrome {companyName} {saving} {dirty} {canSave} onSave={() => void save()} {feedback} />
{#if naming}<CompanyNameDialog
		title="Save contract"
		busy={saving}
		{error}
		onSubmit={(name) => void save(name)}
		onClose={() => (naming = false)}
	/>{/if}
{#if deleted}<p
		role="alert"
		class="mx-auto mt-4 max-w-3xl rounded-md border border-line bg-surface p-3 text-sm"
	>
		This contract was deleted. Your changes have not been saved. <a class="underline" href="/"
			>Back to Home</a
		>
	</p>{/if}
{#if source.renderSource}
	<main
		onclickcapture={recordContractInput}
		class="pt-14 pb-12 min-[1000px]:pt-6"
		aria-label="Contract document"
	>
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
