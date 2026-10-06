<script lang="ts">
	import { documentAnnotations } from '$lib/playbook/document-overlay';
	import { onDestroy, onMount, untrack } from 'svelte';
	import { beforeNavigate, goto } from '$app/navigation';
	import type { BeforeNavigate } from '@sveltejs/kit';
	import { useConvexClient } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import type { Doc, Id } from '../../../convex/_generated/dataModel';
	import type { ContractSnapshot, ContractState } from '$lib/contract/saved';
	import { ContractPersistence } from '$lib/contract/persistence.svelte';
	import { recordOpening } from '$lib/contract/browser-storage';
	import { getContractSnapshotCache } from '$lib/contract/snapshot-cache';
	import type { OperationStatus } from '$lib/components/chrome/operation-status';
	import { createContractWorkspace, setContractWorkspace } from '$lib/document/runtime/context';
	import { conflictsForConcession } from '$lib/playbook/selection-conflicts';
	import { getDocumentResources } from '$lib/document/runtime/resources.svelte';
	import DocumentViewerSlot from '$lib/components/document/DocumentViewerSlot.svelte';
	import LoadingPagination from '$lib/components/document/LoadingPagination.svelte';
	import BoxDismissal from '$lib/components/playbook/BoxDismissal.svelte';
	import RepPlaybookPanel from '$lib/components/playbook/RepPlaybookPanel.svelte';
	import WorkspaceChrome from './WorkspaceChrome.svelte';
	import { recordContractInput } from '$lib/document/runtime/render-perf';
	import { setInteractionOwner } from '$lib/components/ui/interactions';
	let {
		snapshot,
		initialContract,
		metadata,
		onVisible,
		onFailure
	}: {
		snapshot: ContractSnapshot;
		initialContract: Doc<'savedContracts'>;
		metadata: { readonly data: ContractState | null | undefined; readonly error?: unknown };
		onVisible?: () => void;
		onFailure?: () => void;
	} = $props();
	const resources = getDocumentResources();
	const resource = resources
		? untrack(() =>
				resources.acquireContract({
					id: initialContract._id,
					status: 'ready',
					snapshot,
					contract: initialContract
				})
			)
		: undefined;
	if (resource && resources) untrack(() => resources.activate(resource));
	onDestroy(() => {
		if (resource && resources) resources.deactivate(resource);
	});
	const interactionOwner = setInteractionOwner(resource?.owner ?? Symbol('rep-workspace'));
	const workspace = setContractWorkspace(
		resource?.workspace ??
			untrack(() =>
				createContractWorkspace({
					blocks: { data: snapshot.blocks },
					items: { data: snapshot.items }
				})
			)
	);

	const { source, viewer } = workspace;
	const client = useConvexClient();
	const contractId = untrack(() => initialContract._id);
	const persistence = untrack(
		() =>
			new ContractPersistence(
				contractId,
				{
					companyName: initialContract.companyName,
					selectedConcessions: initialContract.selectedConcessions,
					revision: initialContract.revision ?? 0,
					lastOperationId: initialContract.lastOperationId ?? null
				},
				(request) => client.mutation(api.savedContracts.saveChoices, request)
			)
	);
	$effect(() => {
		const next = metadata.data;
		if (next === null) {
			getContractSnapshotCache().remove(contractId);
		}
		if (next !== undefined) untrack(() => persistence.accept(next));
	});
	$effect(() => {
		if (persistence.deleted) {
			getContractSnapshotCache().remove(contractId);
		}
	});
	$effect(() => {
		const confirmed = persistence.confirmed;
		untrack(() => getContractSnapshotCache().updateState(contractId, confirmed));
	});
	$effect(() => {
		const choices = persistence.choices;
		if (resource && resources) resources.update(resource, choices);
	});
	let notifiedVisible = false;
	let recordedOpening = false;
	$effect(() => {
		if (viewer.visible && !persistence.deleted && !source.issue && !notifiedVisible) {
			notifiedVisible = true;
			untrack(() => onVisible?.());
		}
	});
	$effect(() => {
		if (
			viewer.visible &&
			viewer.ready &&
			!persistence.deleted &&
			!workspace.renderer.error &&
			!source.issue &&
			!recordedOpening
		) {
			recordedOpening = true;
			untrack(() => {
				recordOpening(contractId);
			});
		}
	});
	$effect(() => {
		if (
			!notifiedVisible &&
			(workspace.renderer.error || source.issue || viewer.preparationBlocked || persistence.deleted)
		)
			untrack(() => onFailure?.());
	});
	let connected = $state(true);
	let active = true;
	const historyEvents = new AbortController();
	onMount(() => {
		connected = client.connectionState().isWebSocketConnected;
		return client.subscribeToConnectionState((state) => {
			connected = state.isWebSocketConnected;
		});
	});
	onDestroy(() => {
		active = false;
		historyEvents.abort();
		persistence.destroy();
	});
	let leaving = $state(false);
	let allowNavigation = false;
	type Departure = { url: string } | { url: string; delta: number; restored: Promise<void> };
	let destination = $state.raw<Departure | null>(null);
	let historyCompletion: ((navigation: BeforeNavigate) => void) | null = null;
	let navigationError = $state<string | null>(null);
	let navigationAttempt = 0;
	const editable = $derived(persistence.editable && !leaving);
	let changesSaved = $state(false);
	let savingOperation: string | null = null;
	$effect(() => {
		const operationId = persistence.request?.operationId;
		const pending = persistence.pending;
		const confirmedOperation = persistence.confirmed.lastOperationId;
		changesSaved = false;
		if (persistence.conflict || persistence.deleted) {
			savingOperation = null;
			return;
		}
		if (pending) {
			if (operationId) savingOperation = operationId;
			return;
		}
		if (persistence.error || !savingOperation || savingOperation !== confirmedOperation) return;
		savingOperation = null;
		changesSaved = true;
		const timer = setTimeout(() => {
			changesSaved = false;
		}, 2500);
		return () => clearTimeout(timer);
	});
	const feedback = $derived.by<OperationStatus | null>(() => {
		if (persistence.deleted) return null;
		if (persistence.conflict) return null;
		const departure = destination
			? [{ label: 'Leave and discard changes', run: () => void depart(true) }]
			: [];
		if (persistence.error)
			return {
				message: persistence.error,
				urgent: true,
				actions: [{ label: 'Retry', run: retrySave }, ...departure]
			};
		if (metadata.error)
			return {
				message: 'We couldn’t check the latest contract state. Your changes are still here.',
				urgent: true,
				actions: departure
			};
		if (navigationError)
			return {
				message: navigationError,
				urgent: true,
				actions: [{ label: 'Retry', run: () => void depart() }, ...departure]
			};
		if (!connected)
			return {
				message: persistence.pending
					? 'Connection interrupted. Your changes are still here and will save when reconnected.'
					: 'Connection interrupted. Waiting to reconnect.',
				actions: departure
			};
		if (leaving) return { message: 'Saving changes before leaving…', actions: departure };
		return changesSaved ? { message: 'Changes saved' } : null;
	});
	function retrySave() {
		persistence.retry();
		if (destination) void depart();
	}
	async function depart(discard = false) {
		if (!destination) return;
		const attempt = ++navigationAttempt;
		const target = destination;
		leaving = true;
		navigationError = null;
		if (discard) persistence.pause();
		if (!discard && !(await persistence.flush())) {
			if (active && attempt === navigationAttempt) leaving = false;
			return;
		}
		if (!active || attempt !== navigationAttempt) return;
		try {
			if ('delta' in target) {
				// SvelteKit reverses a cancelled popstate asynchronously. Wait for that
				// reversal before replaying the original movement through history.
				await target.restored;
				if (!active || attempt !== navigationAttempt) return;
				allowNavigation = true;
				await new Promise<void>((resolve, reject) => {
					historyCompletion = (navigation) => {
						historyCompletion = null;
						navigation.complete.then(resolve, reject);
					};
					window.history.go(target.delta);
				});
			} else {
				allowNavigation = true;
				await goto(target.url);
			}
		} catch {
			if (active && attempt === navigationAttempt)
				navigationError = 'We couldn’t open that page. Try again.';
		} finally {
			if (active && attempt === navigationAttempt) {
				allowNavigation = false;
				leaving = false;
				persistence.resume();
			}
		}
	}
	async function loadLatest() {
		navigationAttempt++;
		destination = null;
		navigationError = null;
		leaving = false;
		await persistence.loadLatest();
	}
	beforeNavigate((navigation) => {
		if (allowNavigation) {
			historyCompletion?.(navigation);
			return;
		}
		if (persistence.deleted || !persistence.pending) return;
		// The browser's beforeunload warning handles refresh, closure and external links.
		if (navigation.willUnload || !navigation.to) return;
		const url = navigation.to.url.href;
		if (navigation.type === 'popstate' && navigation.from) {
			const from = navigation.from.url.href;
			const restored = new Promise<void>((resolve) => {
				const onRestore = () => {
					if (window.location.href !== from) return;
					window.removeEventListener('popstate', onRestore);
					resolve();
				};
				window.addEventListener('popstate', onRestore, { signal: historyEvents.signal });
			});
			destination = { url, delta: navigation.delta, restored };
		} else destination = { url };
		navigation.cancel();
		void depart();
	});
	function warnBeforeUnload(event: BeforeUnloadEvent) {
		if (!persistence.pending || persistence.deleted || allowNavigation) return;
		event.preventDefault();
		event.returnValue = '';
	}
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
						persistence.choices,
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
		if (!item || !editable) return;
		if (persistence.choices[item._id] !== id && reasons[id]) return;
		persistence.select(item._id, id);
	}
	function close(restoreFocus = true) {
		if (restoreFocus) viewer.restoreAnnotationFocus?.();
		selectedItemId = null;
		selectedAnnotationId = null;
	}
</script>

<BoxDismissal owner={interactionOwner} active={Boolean(item)} onDismiss={close} />

<svelte:window onbeforeunload={warnBeforeUnload} />
<WorkspaceChrome {feedback} />
{#if persistence.deleted}<p
		role="alert"
		class="mx-auto mt-4 max-w-3xl rounded-md border border-line bg-surface p-3 text-sm"
	>
		This contract was deleted. <a class="underline" href="/">Back to Home</a>
	</p>
{:else if persistence.conflict}<div
		role="alert"
		class="mx-auto mt-4 max-w-3xl rounded-md border border-line bg-surface p-3 text-sm"
	>
		This contract changed elsewhere. Load the latest version to continue.
		<button class="ml-2 underline" onclick={() => void loadLatest()}>Load latest</button>
		{#if destination}<button class="ml-2 underline" onclick={() => void depart(true)}
				>Leave and discard changes</button
			>{/if}
	</div>{/if}
{#if source.renderSource && !persistence.deleted}
	<main
		onclickcapture={recordContractInput}
		class="pt-14 pb-12 min-[1000px]:pt-6"
		aria-label="Contract document"
	>
		{#snippet panelContent()}{#if item}<RepPlaybookPanel
					{item}
					selected={persistence.choices[item._id]}
					disabled={!editable}
					conflicts={reasons}
					onToggle={toggle}
					onClose={() => close()}
				/>{/if}{/snippet}
		<DocumentViewerSlot
			entry={resource}
			hasPanel={Boolean(item)}
			{panelContent}
			{selectedAnnotationId}
			selectedConcessions={persistence.choices}
			allowPlaybookNavigation={editable}
			onRemoveConcession={(itemId) => {
				if (editable) persistence.select(itemId as Id<'playbookItems'>, null);
			}}
			panelSource={item?.triggers[0]?.range.start}
			onSelect={(id, trigger) => {
				if (!editable) return false;
				selectedItemId = id;
				selectedAnnotationId = trigger;
			}}
		/>
	</main>
{:else if source.issue && !persistence.deleted}<p role="alert">
		We couldn’t load this contract. Please refresh to try again.
	</p>{:else if !persistence.deleted}<LoadingPagination label="Loading contract" />{/if}
