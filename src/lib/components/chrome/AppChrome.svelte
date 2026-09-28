<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { DocumentSearchSession } from '$lib/document/search/search-session.svelte';
	import UtilityRail from './UtilityRail.svelte';
	import DocumentSearchPanel from '$lib/components/search/DocumentSearchPanel.svelte';
	import type { PersistenceFeedback, UndoState } from '$lib/admin/persistence.svelte';
	import type { EditableCopyKey } from '$lib/contract/model';
	import type { Id } from '../../../convex/_generated/dataModel';
	import { CLAUSE_BOX_TEXT_SECTIONS } from '$lib/components/document/clause-box-config';
	import ArrowCounterClockwiseIcon from 'phosphor-svelte/lib/ArrowCounterClockwiseIcon';
	import MagnifyingGlassIcon from 'phosphor-svelte/lib/MagnifyingGlassIcon';
	import SquareIconButton from '$lib/components/ui/SquareIconButton.svelte';

	let {
		searchTarget,
		onOpenGuide,
		feedback = null,
		onDismissFeedback,
		onDiscardConflict,
		onRetryFailedEdit,
		undo = null,
		onUndo,
		headerText = 'Understand and negotiate the contract (beta)'
	}: {
		searchTarget?: HTMLDivElement;
		onOpenGuide: () => void;
		feedback?: PersistenceFeedback | null;
		onDismissFeedback?: (id: Id<'clauseBoxes'>) => void;
		onDiscardConflict?: (id: Id<'clauseBoxes'>, field: EditableCopyKey | 'tooltip') => void;
		onRetryFailedEdit?: (id: Id<'clauseBoxes'>, field: EditableCopyKey | 'tooltip') => void;
		undo?: UndoState | null;
		onUndo?: () => void;
		headerText?: string;
	} = $props();
	function fieldLabel(field: EditableCopyKey | 'tooltip') {
		if (field === 'summary') return 'summary';
		if (field === 'tooltip') return 'tooltip setting';
		return CLAUSE_BOX_TEXT_SECTIONS.find((section) => section.key === field)?.label ?? field;
	}
	const searchSession = new DocumentSearchSession();
	let searchOpen = $state(false);
	let searchButton: HTMLButtonElement | undefined;
	let desktopSearchButton = $state<HTMLButtonElement>();
	let mobileSearchButton = $state<HTMLButtonElement>();

	function visibleSearchButton() {
		return [searchButton, mobileSearchButton, desktopSearchButton].find(
			(button) => button?.isConnected && button.getClientRects().length
		);
	}

	function closeSearch(restoreFocus = true) {
		if (!searchOpen) return;
		searchOpen = false;
		searchSession.clear();
		if (restoreFocus) void tick().then(() => visibleSearchButton()?.focus({ preventScroll: true }));
	}

	function toggleSearch(trigger: HTMLButtonElement) {
		if (searchOpen) {
			closeSearch();
			return;
		}
		searchButton = trigger;
		searchOpen = true;
	}

	function openGuide() {
		closeSearch(false);
		onOpenGuide();
	}

	function handleOutsidePointerDown(event: PointerEvent) {
		if (!searchOpen) return;
		const inside = event
			.composedPath()
			.some(
				(node) =>
					node instanceof HTMLElement &&
					(node.hasAttribute('data-utility-panel') || node.hasAttribute('data-utility-trigger'))
			);
		if (!inside) closeSearch(false);
	}

	function focusSearchInput() {
		void tick().then(() =>
			document
				.querySelector<HTMLInputElement>('[data-search-input]')
				?.focus({ preventScroll: true })
		);
	}

	function handleKeydown(event: KeyboardEvent) {
		const isFindShortcut =
			(event.metaKey || event.ctrlKey) &&
			!event.altKey &&
			!event.shiftKey &&
			event.key.toLowerCase() === 'f';

		if (isFindShortcut) {
			event.preventDefault();
			if (!searchOpen) {
				searchButton = visibleSearchButton();
				searchOpen = true;
			}
			focusSearchInput();
			return;
		}

		if (!searchOpen || event.key !== 'Escape') return;
		event.preventDefault();
		closeSearch();
	}

	$effect(() => searchSession.setTarget(searchTarget));

	onMount(() => {
		document.addEventListener('pointerdown', handleOutsidePointerDown);
		document.addEventListener('keydown', handleKeydown);
		return () => {
			document.removeEventListener('pointerdown', handleOutsidePointerDown);
			document.removeEventListener('keydown', handleKeydown);
			searchSession.destroy();
		};
	});
</script>

<header
	class="sticky top-0 z-40 flex h-[var(--app-header-height)] items-center border-b border-line bg-surface/96 px-[18px] backdrop-blur-[12px] max-[650px]:px-3"
>
	<p class="m-0 min-w-0 flex-1 truncate text-sm text-ink-secondary">
		{headerText}
	</p>
	<div class="flex shrink-0 items-center gap-1">
		<div class="hidden max-[999px]:block">
			<SquareIconButton
				bind:element={mobileSearchButton}
				type="button"
				aria-label="Search"
				aria-pressed={searchOpen}
				aria-controls="document-search"
				data-utility-trigger="search"
				onclick={() => mobileSearchButton && toggleSearch(mobileSearchButton)}
			>
				<MagnifyingGlassIcon aria-hidden="true" size={19} weight="regular" />
			</SquareIconButton>
		</div>
		{#if onUndo}
			<SquareIconButton
				type="button"
				aria-label="Undo last edit"
				title="Undo last edit"
				disabled={!undo || undo.pending}
				onclick={onUndo}
			>
				<ArrowCounterClockwiseIcon size={19} weight="regular" />
			</SquareIconButton>
		{/if}
	</div>
	{#if searchOpen || feedback}
		<div
			class="pointer-events-none absolute top-[calc(100%+20px)] right-0 left-0 flex justify-center max-[999px]:top-[calc(100%+8px)] max-[999px]:right-3 max-[999px]:left-auto max-[999px]:w-[min(454px,calc(100vw-24px))] max-[999px]:flex-col max-[999px]:items-end max-[999px]:gap-2"
		>
			{#if searchOpen}
				<div
					class="pointer-events-auto absolute top-0 left-[84px] w-[378px] max-[999px]:static max-[999px]:w-full"
				>
					<DocumentSearchPanel session={searchSession} />
				</div>
			{/if}
			{#if feedback}
				<div
					class={`pointer-events-none rounded-xl border border-line bg-surface px-2.5 py-1.5 text-[14px] leading-5 text-ink-secondary shadow-sm max-[999px]:w-full max-[999px]:px-3 max-[999px]:py-1 max-[999px]:text-sm ${searchOpen ? 'ml-auto max-w-[calc(100vw-486px)] max-[999px]:max-w-none' : ''}`}
					role={[
						'save-failed',
						'conflict',
						'removed',
						'delete-failed',
						'delete-unconfirmed',
						'delete-already-missing',
						'undo-conflict',
						'undo-removed',
						'undo-unavailable',
						'undo-failed',
						'undo-restore-conflict',
						'undo-restore-failed',
						'undo-restore-unavailable'
					].includes(feedback?.kind ?? '')
						? 'alert'
						: 'status'}
				>
					{#if feedback.kind === 'saving'}
						Saving…
					{:else if feedback.kind === 'deleting'}
						Deleting box…
					{:else if feedback.kind === 'saved'}
						Changes saved
					{:else if feedback.kind === 'save-failed'}
						Couldn’t save {fieldLabel(feedback.field)} for {feedback.clauseKey}.
						<button
							type="button"
							class="pointer-events-auto cursor-pointer font-medium text-accent underline"
							onclick={() => onRetryFailedEdit?.(feedback.id, feedback.field)}>Retry</button
						>
					{:else if feedback.kind === 'conflict'}
						{fieldLabel(feedback.field)} for {feedback.clauseKey} changed elsewhere.
						<button
							type="button"
							class="pointer-events-auto cursor-pointer font-medium text-accent underline"
							onclick={() => onDiscardConflict?.(feedback.id, feedback.field)}>Discard draft</button
						>
					{:else if feedback.kind === 'removed'}
						Box {feedback.clauseKey} removed elsewhere. Edits discarded.
						<button
							type="button"
							class="pointer-events-auto cursor-pointer font-medium text-accent underline"
							onclick={() => onDismissFeedback?.(feedback.id)}>Dismiss</button
						>
					{:else if feedback.kind === 'delete-failed'}
						Couldn’t delete box {feedback.clauseKey}.
						<button
							type="button"
							class="pointer-events-auto cursor-pointer font-medium text-accent underline"
							onclick={() => onDismissFeedback?.(feedback.id)}>Dismiss</button
						>
					{:else if feedback.kind === 'delete-already-missing'}
						Box {feedback.clauseKey} was already removed. Undo is unavailable.
						<button
							type="button"
							class="pointer-events-auto cursor-pointer font-medium text-accent underline"
							onclick={() => onDismissFeedback?.(feedback.id)}>Dismiss</button
						>
					{:else if feedback.kind === 'delete-unconfirmed'}
						Couldn’t confirm deletion of box {feedback.clauseKey}. Checking again when connected.
						<button
							type="button"
							class="pointer-events-auto cursor-pointer font-medium text-accent underline"
							onclick={() => onDismissFeedback?.(feedback.id)}>Dismiss</button
						>
					{:else if feedback.kind === 'deleted'}
						Box deleted.
					{:else if feedback.kind === 'undoing'}
						Undoing change…
					{:else if feedback.kind === 'undone'}
						Change undone.
					{:else if feedback.kind === 'undo-conflict'}
						Couldn’t undo {fieldLabel(feedback.field)} for {feedback.clauseKey}: it changed
						elsewhere.
						<button
							type="button"
							class="pointer-events-auto cursor-pointer font-medium text-accent underline"
							onclick={() => onDismissFeedback?.(feedback.id)}>Dismiss</button
						>
					{:else if feedback.kind === 'undo-removed'}
						Couldn’t undo {fieldLabel(feedback.field)} for {feedback.clauseKey}: the box was
						removed.
						<button
							type="button"
							class="pointer-events-auto cursor-pointer font-medium text-accent underline"
							onclick={() => onDismissFeedback?.(feedback.id)}>Dismiss</button
						>
					{:else if feedback.kind === 'undo-unavailable'}
						Box {feedback.clauseKey} was removed elsewhere. Undo is no longer available.
						<button
							type="button"
							class="pointer-events-auto cursor-pointer font-medium text-accent underline"
							onclick={() => onDismissFeedback?.(feedback.id)}>Dismiss</button
						>
					{:else if feedback.kind === 'undo-failed'}
						Couldn’t undo {fieldLabel(feedback.field)} for {feedback.clauseKey}. Try again.
					{:else if feedback.kind === 'undo-restore-conflict'}
						Couldn’t restore box {feedback.clauseKey}: a box with that clause key already exists.
						<button
							type="button"
							class="pointer-events-auto cursor-pointer font-medium text-accent underline"
							onclick={() => onDismissFeedback?.(feedback.id)}>Dismiss</button
						>
					{:else if feedback.kind === 'undo-restore-failed'}
						Couldn’t restore box {feedback.clauseKey}. Try again.
					{:else if feedback.kind === 'undo-restore-unavailable'}
						Couldn’t restore box {feedback.clauseKey}: this deletion is no longer available to undo.
						<button
							type="button"
							class="pointer-events-auto cursor-pointer font-medium text-accent underline"
							onclick={() => onDismissFeedback?.(feedback.id)}>Dismiss</button
						>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</header>

<div
	class="pointer-events-none fixed top-[calc(var(--app-header-height)+20px)] left-2 z-15 max-[999px]:hidden"
>
	<UtilityRail
		{searchOpen}
		bind:searchElement={desktopSearchButton}
		onSearchToggle={toggleSearch}
		onOpenGuide={openGuide}
	/>
</div>
