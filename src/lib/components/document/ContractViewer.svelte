<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { getDocumentViewportMetrics } from '$lib/document/document-viewport';
	import { PAGE_FORMAT } from '$lib/document/pagination/page-format';
	import { paginateDocument } from '$lib/document/pagination/paginate';
	import type { PageLayout, PageMeasurement } from '$lib/document/pagination/types';
	import type {
		ClauseBoxRecord,
		SelectedConcession,
		ContractBlock,
		EditableCopyKey
	} from '$lib/contract/model';
	import { resolveContract } from '$lib/contract/resolve';
	import { hasPublicContent } from '$lib/contract/box-content';
	import type { Id } from '../../../convex/_generated/dataModel';
	import '$lib/styles/document.css';
	import DocumentPage from './DocumentPage.svelte';
	import ContractWorkspaceLayout from './ContractWorkspaceLayout.svelte';
	import LoadingPagination from './LoadingPagination.svelte';
	import MeasureSurface from './MeasureSurface.svelte';
	import ClauseBox from './ClauseBox.svelte';
	import type { AdminPersistence } from '$lib/admin/persistence.svelte';
	import { SIDE_BOX_BREAKPOINT, SIDE_BOX_RESERVED_WIDTH } from './workspace-layout';

	let {
		blocks,
		boxes,
		adminEdits,
		documentStageElement = $bindable()
	}: {
		blocks: ContractBlock[];
		boxes: ClauseBoxRecord[];
		adminEdits?: AdminPersistence;
		documentStageElement?: HTMLDivElement;
	} = $props();
	type PaginationStatus = 'loading' | 'ready' | 'error';
	let paginationStatus = $state<PaginationStatus>('loading');
	let paginationComplete = $state(false);
	let paginationError = $state(false);
	let paginationRun = 0;
	let pages = $state<PageLayout[]>([]);
	let selectedConcessions = $state<Record<string, SelectedConcession>>({});
	let selectedConcessionByClause = $derived(
		Object.fromEntries(
			Object.entries(selectedConcessions).map(([key, item]) => [key, item.concessionKey])
		)
	);
	let boxesByClause = $derived(new Map(boxes.map((box) => [box.clauseKey, box] as const)));
	let activeClauseKeys = $state.raw<ReadonlySet<string>>(new Set());
	let selectedClauseKey = $state<string | null>(null);
	let selectionVersion = 0;
	let selectedOccurrenceKey = $state<string | null>(null);
	let selectedFragmentKey = $state<string | null>(null);
	let boxTop = $state(0);
	let measurement = $state<PageMeasurement>();
	let clauseBoxElement = $state<HTMLElement>();
	let layoutElement = $state<HTMLDivElement>();
	let layoutWidth = $state(PAGE_FORMAT.width + 30);
	let pageScale = $derived(
		Math.min(
			1,
			Math.max(
				280,
				selectedClauseKey && layoutWidth >= SIDE_BOX_BREAKPOINT
					? layoutWidth - SIDE_BOX_RESERVED_WIDTH
					: layoutWidth - 30
			) / PAGE_FORMAT.width
		)
	);

	let displayWidth = $derived(PAGE_FORMAT.width * pageScale);
	let logicalStackHeight = $derived(
		pages.length * PAGE_FORMAT.height + Math.max(0, pages.length - 1) * PAGE_FORMAT.gap
	);
	let displayHeight = $derived(logicalStackHeight * pageScale);

	function selectedFragment(): HTMLElement | undefined {
		if (!selectedOccurrenceKey || !documentStageElement) return;
		const fragments = Array.from(
			documentStageElement.querySelectorAll<HTMLElement>('[data-clause-fragment-key]')
		);
		const matching = fragments.filter(
			(fragment) => fragment.dataset.occurrenceKey === selectedOccurrenceKey
		);
		return (
			matching.find((fragment) => fragment.dataset.clauseFragmentKey === selectedFragmentKey) ??
			matching[0]
		);
	}

	async function positionBoxAfterRender() {
		await tick();
		const fragment = selectedFragment();
		if (!fragment) {
			if (selectedOccurrenceKey && paginationComplete) clearSelection();
			return;
		}
		if (!documentStageElement) return;
		boxTop =
			fragment.getBoundingClientRect().top - documentStageElement.getBoundingClientRect().top;
		selectedFragmentKey = fragment.dataset.clauseFragmentKey ?? selectedFragmentKey;
		const box = clauseBoxElement;
		const boxParent = box?.parentElement;
		if (!box || !boxParent || getComputedStyle(boxParent).position !== 'fixed') return;
		const bounds = fragment.getBoundingClientRect();
		const boxBounds = box.getBoundingClientRect();
		const viewport = getDocumentViewportMetrics();
		const availableBottom = boxBounds.top - viewport.gap;
		if (bounds.bottom > availableBottom) window.scrollBy({ top: bounds.bottom - availableBottom });
		else if (bounds.top < viewport.top) window.scrollBy({ top: bounds.top - viewport.top });
	}

	function selectClause(clauseKey: string, occurrenceKey: string, fragmentKey: string) {
		if (!activeClauseKeys.has(clauseKey)) return;
		clearSelection();
		selectedClauseKey = clauseKey;
		selectedOccurrenceKey = occurrenceKey;
		selectedFragmentKey = fragmentKey;
	}

	function clearSelection(restoreFocus = false, preserveDeleteFocus = false) {
		const focusTarget = restoreFocus ? selectedFragment() : undefined;
		if (!preserveDeleteFocus) selectionVersion++;
		selectedClauseKey = null;
		selectedOccurrenceKey = null;
		selectedFragmentKey = null;
		if (focusTarget) void tick().then(() => focusTarget.focus({ preventScroll: true }));
	}

	$effect(() => {
		const next = new Set(
			boxes.filter((box) => adminEdits || hasPublicContent(box)).map((box) => box.clauseKey)
		);
		if (next.size !== activeClauseKeys.size || [...next].some((key) => !activeClauseKeys.has(key)))
			activeClauseKeys = next;
	});

	// Reconcile only selected replacement content. Ordinary box copy never enters document resolution.
	$effect(() => {
		const byClause = boxesByClause;
		adminEdits?.reconcile(boxes);
		const selected = selectedConcessions;
		const next = { ...selected };
		let changed = false;
		for (const [key, previous] of Object.entries(selected)) {
			const box = byClause.get(key);
			const current = [...(box?.preferredConcessions ?? []), ...(box?.rareConcessions ?? [])].find(
				(item) => item.concessionKey === previous.concessionKey
			);
			if (!current) {
				delete next[key];
				changed = true;
			} else if (!sameReplacements(current, previous)) {
				next[key] = { concessionKey: current.concessionKey, replacements: current.replacements };
				changed = true;
			}
		}
		if (changed) selectedConcessions = next;
		if (selectedClauseKey && !activeClauseKeys.has(selectedClauseKey)) clearSelection(false, true);
	});

	$effect(() => {
		if (!adminEdits || !selectedClauseKey) return;
		return () => adminEdits?.closeEditors();
	});

	$effect(() => {
		const visiblePages = pages.length;
		if (selectedOccurrenceKey && visiblePages) void positionBoxAfterRender();
	});

	$effect(() => {
		const element = layoutElement;
		if (!element) return;
		layoutWidth = element.getBoundingClientRect().width;
		const observer = new ResizeObserver(([entry]) => {
			layoutWidth = entry.contentBoxSize?.[0]?.inlineSize ?? entry.contentRect.width;
			void positionBoxAfterRender();
		});
		observer.observe(element);
		return () => observer.disconnect();
	});

	function sameReplacements(a: SelectedConcession, b: SelectedConcession): boolean {
		if (a.replacements.length !== b.replacements.length) return false;
		return a.replacements.every((replacement, index) => {
			const other = b.replacements[index];
			return (
				replacement.targetProvisionKey === other.targetProvisionKey &&
				replacement.content.length === other.content.length &&
				replacement.content.every((atom, at) => {
					const old = other.content[at];
					return (
						atom.kind === old.kind &&
						(atom.kind === 'text' && old.kind === 'text'
							? atom.text === old.text &&
								atom.marks?.bold === old.marks?.bold &&
								atom.marks?.italic === old.marks?.italic
							: atom.kind === 'reference' &&
								old.kind === 'reference' &&
								atom.targetItemKey === old.targetItemKey &&
								atom.endTargetItemKey === old.endTargetItemKey)
					);
				})
			);
		});
	}

	async function paginate(
		currentBlocks: ContractBlock[],
		selection: Record<string, SelectedConcession>,
		surface: PageMeasurement
	) {
		const run = ++paginationRun;
		pages = [];
		paginationComplete = false;
		paginationError = false;
		paginationStatus = 'loading';
		try {
			await tick();
			if (run !== paginationRun) return;
			const document = resolveContract({
				blocks: currentBlocks,
				selectedConcessions: selection,
				view: 'redline'
			});
			const iterator = paginateDocument(document, surface);
			while (run === paginationRun) {
				const next = iterator.next();
				if (next.done) break;
				pages = [...pages, next.value];
				paginationStatus = 'ready';
				// A completed page cannot change; let the browser paint before measuring the next.
				await new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
			}
			if (run !== paginationRun) return;
			if (!pages.length) throw new Error('Pagination produced no pages.');
			paginationComplete = true;
			if (selectedOccurrenceKey) void positionBoxAfterRender();
		} catch (error) {
			if (run !== paginationRun) return;
			console.error('Contract pagination failed.', error);
			if (pages.length) paginationError = true;
			else paginationStatus = 'error';
		}
	}

	$effect(() => {
		const surface = measurement;
		const currentBlocks = blocks;
		const selection = selectedConcessions;
		if (surface) void paginate(currentBlocks, selection, surface);
		return () => {
			paginationRun++;
		};
	});

	function toggleConcession(clauseKey: string, concessionKey: string) {
		const box = boxesByClause.get(clauseKey);
		if (box && adminEdits?.isDeleting(box.id)) return;
		const item = [...(box?.preferredConcessions ?? []), ...(box?.rareConcessions ?? [])].find(
			(concession) => concession.concessionKey === concessionKey
		);
		if (!item) return;
		const next = { ...selectedConcessions };
		if (next[clauseKey]?.concessionKey === concessionKey) delete next[clauseKey];
		else next[clauseKey] = { concessionKey: item.concessionKey, replacements: item.replacements };
		selectedConcessions = next;
	}

	function updateTextDraft(id: Id<'clauseBoxes'>, sectionKey: EditableCopyKey, value: string) {
		adminEdits?.updateCopy(id, sectionKey, value);
	}
	function updateTooltipOverride(id: Id<'clauseBoxes'>, value: boolean) {
		adminEdits?.updateTooltip(id, value);
	}
	async function deleteBox(id: Id<'clauseBoxes'>) {
		if (!adminEdits) return;
		const clauseKey = selectedClauseKey;
		if (!clauseKey) return;
		const version = selectionVersion;
		const clauses = Array.from(
			documentStageElement?.querySelectorAll<HTMLElement>('.contract-clause[tabindex="0"]') ?? []
		);
		const fragment = selectedFragment();
		const index = fragment ? clauses.indexOf(fragment) : -1;
		const next =
			index < 0
				? undefined
				: clauses.slice(index + 1).find((clause) => clause.dataset.clauseKey !== clauseKey);
		const previous =
			index < 0
				? undefined
				: clauses
						.slice(0, index)
						.reverse()
						.find((clause) => clause.dataset.clauseKey !== clauseKey);
		const focusAfterDelete = next ?? previous;
		const nextOccurrenceKey = focusAfterDelete?.dataset.occurrenceKey;
		const nextFragmentKey = focusAfterDelete?.dataset.clauseFragmentKey;
		if (!(await adminEdits.deleteBox(id))) return;
		if (selectedConcessions[clauseKey]) {
			const selected = { ...selectedConcessions };
			delete selected[clauseKey];
			selectedConcessions = selected;
		}
		if (selectionVersion !== version || (selectedClauseKey && selectedClauseKey !== clauseKey))
			return;
		if (selectedClauseKey === clauseKey) clearSelection(false, true);
		await tick();
		if (selectionVersion !== version) return;
		const availableClauses = Array.from(
			documentStageElement?.querySelectorAll<HTMLElement>('.contract-clause[tabindex="0"]') ?? []
		);
		const focusTarget =
			availableClauses.find(
				(clause) =>
					clause.dataset.occurrenceKey === nextOccurrenceKey &&
					clause.dataset.clauseFragmentKey === nextFragmentKey
			) ?? availableClauses.find((clause) => clause.dataset.occurrenceKey === nextOccurrenceKey);
		(focusTarget ?? documentStageElement)?.focus({ preventScroll: true });
	}

	onMount(() => {
		function handleResize() {
			void positionBoxAfterRender();
		}
		function handlePointerDown(event: PointerEvent) {
			if (!selectedClauseKey) return;
			const inside = event
				.composedPath()
				.some(
					(node) =>
						node instanceof HTMLElement &&
						(Boolean(node.dataset.clauseKey) || node.hasAttribute('data-clause-box'))
				);
			if (!inside) clearSelection();
		}
		function handleKeydown(event: KeyboardEvent) {
			if (event.key === 'Escape') clearSelection(true);
		}
		window.addEventListener('resize', handleResize);
		document.addEventListener('pointerdown', handlePointerDown);
		document.addEventListener('keydown', handleKeydown);
		return () => {
			window.removeEventListener('resize', handleResize);
			document.removeEventListener('pointerdown', handlePointerDown);
			document.removeEventListener('keydown', handleKeydown);
		};
	});
</script>

<MeasureSurface {activeClauseKeys} bind:measurement />
{#if paginationStatus === 'loading'}
	<LoadingPagination />
{:else if paginationStatus === 'error'}
	<div
		class="flex min-h-[calc(100vh-100px)] flex-col items-center justify-center gap-1.5 text-center text-ink-secondary"
		role="alert"
	>
		<strong>We couldn’t display this contract.</strong>
		<span class="text-ink-muted">Please refresh to try again.</span>
	</div>
{:else}
	<div
		class="viewer-root w-full"
		data-pagination-status={paginationError
			? 'error'
			: paginationComplete
				? 'ready'
				: 'progressive'}
		data-page-count={pages.length}
		style:--contract-page-width={`${PAGE_FORMAT.width}px`}
		style:--contract-page-height={`${PAGE_FORMAT.height}px`}
		style:--contract-page-horizontal-padding={`${PAGE_FORMAT.horizontalPadding}px`}
		style:--contract-page-top-padding={`${PAGE_FORMAT.topPadding}px`}
		style:--contract-first-page-top-padding={`${PAGE_FORMAT.firstTopPadding}px`}
		style:--contract-page-bottom-padding={`${PAGE_FORMAT.bottomPadding}px`}
		style:--contract-content-width={`${PAGE_FORMAT.contentWidth}px`}
		style:--contract-page-gap={`${PAGE_FORMAT.gap}px`}
	>
		{#snippet documentContent()}
			<div
				class="page-viewport relative shrink-0"
				style:width={`${displayWidth}px`}
				style:height={`${displayHeight}px`}
			>
				<div
					class="page-stack absolute top-0 left-0 flex w-(--contract-page-width) origin-top-left flex-col gap-(--contract-page-gap)"
					style:transform={`scale(${pageScale})`}
				>
					{#each pages as page}
						<DocumentPage
							{page}
							{selectedOccurrenceKey}
							{activeClauseKeys}
							onClauseSelect={selectClause}
						/>
					{/each}
				</div>
			</div>
		{/snippet}
		{#snippet clauseBoxContent()}
			{#if selectedClauseKey && boxesByClause.has(selectedClauseKey)}
				{#key selectedClauseKey}
					<ClauseBox
						box={boxesByClause.get(selectedClauseKey)!}
						adminMode={Boolean(adminEdits)}
						deleting={adminEdits?.isDeleting(boxesByClause.get(selectedClauseKey)!.id) ?? false}
						undoPending={adminEdits?.undo?.pending ?? false}
						textDrafts={adminEdits?.drafts[boxesByClause.get(selectedClauseKey)!.id] ?? {}}
						tooltipOverride={adminEdits?.tooltipOverrides[boxesByClause.get(selectedClauseKey)!.id]}
						{updateTextDraft}
						{updateTooltipOverride}
						onBlurTextDraft={(id, section) => adminEdits?.blurCopy(id, section)}
						{selectedConcessionByClause}
						onToggleConcession={toggleConcession}
						onDelete={deleteBox}
						onDismiss={() => clearSelection(true)}
						bind:element={clauseBoxElement}
					/>
				{/key}
			{/if}
		{/snippet}
		<ContractWorkspaceLayout
			hasClauseBox={selectedClauseKey !== null && boxesByClause.has(selectedClauseKey)}
			displayedPageWidth={displayWidth}
			documentHeight={displayHeight}
			{boxTop}
			bind:layoutElement
			bind:documentStageElement
			{documentContent}
			{clauseBoxContent}
		/>
	</div>
	{#if paginationError}<p role="alert" class="mt-5 text-center text-ink-muted">
			Some pages couldn’t be laid out. Please refresh to try again.
		</p>{/if}
{/if}
