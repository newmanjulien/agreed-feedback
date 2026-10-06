<script lang="ts">
	import { documentAnnotations } from '$lib/playbook/document-overlay';
	import { onDestroy, onMount, untrack } from 'svelte';
	import { beforeNavigate, goto } from '$app/navigation';
	import { navigating } from '$app/state';
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
	import { sameSelection } from '$lib/playbook/model';
	import type { ConcessionSelection, ContractRenderSource } from '$lib/document/runtime/types';
	import { composeExport } from '$lib/contract/export/content';
	import { downloadWord, prepareWord, retireWordUrl } from '$lib/contract/export/word';
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
		invalidateWord();
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
	let exportError = $state<string | null>(null);
	type WordInput = {
		source: ContractRenderSource;
		concessions: ConcessionSelection;
		companyName: string;
	};
	let wordInput: WordInput | null = null;
	let wordAttempted = false;
	let wordAttempt = $state.raw<{ input: WordInput; controller: AbortController } | null>(null);
	const preparingWord = $derived(wordAttempt !== null);
	let preparedWord = $state.raw<{ input: WordInput; url: string } | null>(null);
	const savedExportInput = $derived.by<WordInput | null>(() => {
		if (persistence.pending || persistence.deleted || !source.renderSource) return null;
		return {
			source: source.renderSource,
			concessions: Object.freeze({ ...persistence.confirmed.selectedConcessions }),
			companyName: persistence.confirmed.companyName
		};
	});
	// Eligibility is independent of export activity so preparation cannot cancel itself.
	const eligibleExportSnapshot = $derived.by(() => {
		const rendered = viewer.displayedSnapshot;
		if (
			persistence.pending ||
			persistence.error ||
			persistence.conflict ||
			persistence.deleted ||
			metadata.error ||
			!connected ||
			source.issue ||
			workspace.renderer.pending ||
			workspace.renderer.error ||
			viewer.preparationBlocked ||
			!viewer.ready ||
			!viewer.visible ||
			leaving ||
			destination ||
			navigationError ||
			navigating.to ||
			!rendered ||
			!rendered.pages.length ||
			rendered !== workspace.renderer.snapshot ||
			rendered.source !== source.renderSource ||
			rendered.previewChanges.length ||
			!sameSelection(rendered.concessions, persistence.confirmed.selectedConcessions)
		)
			return null;
		return rendered;
	});
	const exportSnapshot = $derived(preparingWord ? null : eligibleExportSnapshot);
	function sameWordInput(a: WordInput | null, b: WordInput | null): boolean {
		return (
			a === b ||
			Boolean(
				a &&
				b &&
				a.source === b.source &&
				a.companyName === b.companyName &&
				sameSelection(a.concessions, b.concessions)
			)
		);
	}
	function invalidateWord() {
		const attempt = wordAttempt;
		wordAttempt = null;
		attempt?.controller.abort();
		if (preparedWord) retireWordUrl(preparedWord.url);
		preparedWord = null;
	}
	$effect(() => {
		const input = savedExportInput;
		const rendered = eligibleExportSnapshot;
		untrack(() => {
			if (!sameWordInput(wordInput, input)) {
				invalidateWord();
				wordInput = input;
				wordAttempted = false;
				exportError = null;
			}
			// Pagination and temporary viewer guards do not change the attempt identity.
			if (input && rendered && !wordAttempted) void prepareWordDownload(rendered, input);
		});
	});
	async function prepareWordDownload(
		captured: NonNullable<typeof eligibleExportSnapshot>,
		input: WordInput
	) {
		if (!active || preparingWord) return;
		const attempt = { input, controller: new AbortController() };
		wordInput = input;
		wordAttempted = true;
		wordAttempt = attempt;
		exportError = null;
		try {
			const blob = await prepareWord(
				composeExport(captured),
				input.companyName,
				attempt.controller.signal
			);
			if (!active || wordAttempt !== attempt || !sameWordInput(input, savedExportInput)) return;
			const url = URL.createObjectURL(blob);
			if (preparedWord) retireWordUrl(preparedWord.url);
			preparedWord = { input, url };
		} catch {
			if (
				active &&
				wordAttempt === attempt &&
				!attempt.controller.signal.aborted &&
				sameWordInput(input, savedExportInput)
			)
				exportError = 'We couldn’t prepare this download. Try again.';
		} finally {
			if (wordAttempt === attempt) wordAttempt = null;
		}
	}
	function downloadPreparedWord() {
		const captured = exportSnapshot;
		const input = savedExportInput;
		if (!active || !captured || !input) return;
		if (!preparedWord || !sameWordInput(preparedWord.input, input)) {
			// Explicit retry only prepares the file; a separate click downloads it.
			if (!sameWordInput(wordInput, input)) invalidateWord();
			void prepareWordDownload(captured, input);
			return;
		}
		try {
			downloadWord(preparedWord.url, input.companyName);
			exportError = null;
		} catch {
			exportError = 'We couldn’t prepare this download. Try again.';
		}
	}
	const actionButtonClass =
		'cursor-pointer rounded-lg border border-accent/90 bg-accent/90 px-5 py-2.5 font-normal text-sm text-surface enabled:hover:border-accent-hover enabled:hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-accent disabled:cursor-default disabled:border-line disabled:bg-control-fill disabled:text-ink-muted';
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
		class="pt-14 pb-16 min-[1000px]:pt-6"
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
		{#snippet footerContent()}
			<div
				class="pt-6"
				role="group"
				aria-label="Contract downloads"
				aria-busy={preparingWord}
			>
				<div class="flex flex-wrap justify-center gap-3">
					<span
						class="group/pdf relative inline-flex focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-accent"
						role="button"
						tabindex="0"
						aria-disabled="true"
						aria-label="Download as .pdf. PDF downloads are coming"
					>
						<button
							type="button"
							class={`${actionButtonClass} pointer-events-none`}
							disabled>Download as .pdf</button
						>
						<span
							role="tooltip"
							class="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden w-max max-w-72 -translate-x-1/2 rounded-base bg-ink-secondary px-2.5 py-2 text-xs leading-[1.4] text-surface group-hover/pdf:block group-focus-visible/pdf:block"
						>PDF downloads are coming</span>
					</span>
					<button
						type="button"
						class={actionButtonClass}
						disabled={!exportSnapshot}
						onclick={downloadPreparedWord}>Download as .docx</button
					>
				</div>
				{#if preparingWord}
					<p class="mt-3 text-center text-sm text-ink-muted" role="status">
						Preparing Word download…
					</p>
				{:else if exportError}
					<p class="mt-3 text-center text-sm text-ink-muted" role="alert">{exportError}</p>
				{/if}
			</div>
		{/snippet}
		<DocumentViewerSlot
			entry={resource}
			hasPanel={Boolean(item)}
			{panelContent}
			{footerContent}
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
