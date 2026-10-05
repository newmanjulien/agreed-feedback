<script lang="ts">
	import { setAnnotationRegistry } from '$lib/document/annotation-registry';
	import {
		annotationOccurrence,
		annotationAnchorBounds,
		resolveAnnotationAnchor,
		type AnnotationActivation,
		type AnnotationOccurrence
	} from '$lib/document/annotation-anchor';
	import { triggerAnnotationId } from '$lib/playbook/document-overlay';
	import { tick, untrack, onMount, onDestroy, type Snippet } from 'svelte';
	import type { ContractChange, SourcePoint, SourceRange } from '$lib/playbook/model';
	import { pointPosition } from '$lib/contract/source-index';
	import { unitsInRange } from '$lib/contract/ranges';
	import { EMPTY_PREVIEW_CHANGES, type ConcessionSelection } from '$lib/document/runtime/types';
	import { recordColdStart } from '$lib/document/runtime/render-perf';
	import { prewarmSavedConcessions } from '$lib/document/runtime/prewarm';
	import {
		sourcePointBounds,
		sourceRangeToDomRanges,
		sourceOccurrence
	} from '$lib/document/selection/dom-selection';
	import {
		DocumentHighlightController,
		EMPTY_HIGHLIGHTS,
		type PageHighlights
	} from '$lib/document/highlights/controller';
	import { DocumentClauseInteractions } from '$lib/document/highlights/interactions';
	import { getContractLayoutProfiles } from '$lib/document/runtime/layout-context.svelte';
	import { getContractWorkspace } from '$lib/document/runtime/context';
	import { activeConflicts } from '$lib/playbook/selection-conflicts';
	import { getDocumentViewportMetrics } from '$lib/document/document-viewport';
	import { PAGE_FORMAT } from '$lib/document/pagination/page-format';
	import {
		LayoutProfiler,
		type LayoutProfileSurface as ProfileSurface
	} from '$lib/document/pagination/profiler';
	import { SIDE_PANEL_BREAKPOINT, SIDE_PANEL_RESERVED_WIDTH } from './workspace-layout';
	import DocumentPage from './DocumentPage.svelte';
	import LayoutProfileSurface from './LayoutProfileSurface.svelte';
	import LoadingPagination from './LoadingPagination.svelte';
	import ContractWorkspaceLayout from './ContractWorkspaceLayout.svelte';
	import '$lib/styles/document.css';
	const annotationRegistry = setAnnotationRegistry();
	let {
		hasPanel = false,
		followScroll = false,
		panelContent,
		selectedConcessions,
		onRemoveConcession,
		selectedAnnotationId = null,
		selectedRanges = [],
		previewChanges = EMPTY_PREVIEW_CHANGES,
		panelSource,
		picking = false,
		allowPlaybookNavigation = true,
		onSelect
	}: {
		hasPanel?: boolean;
		followScroll?: boolean;
		panelContent: Snippet;
		selectedConcessions: ConcessionSelection;
		onRemoveConcession: (itemId: string) => void;
		selectedAnnotationId?: string | null;
		selectedRanges?: readonly SourceRange[];
		previewChanges?: readonly ContractChange[];
		panelSource?: SourcePoint;
		picking?: boolean;
		allowPlaybookNavigation?: boolean;
		onSelect: (itemId: string, annotationId: string) => boolean | void;
	} = $props();
	const { source, renderer, viewer } = getContractWorkspace();
	const snapshot = $derived(renderer.snapshot);
	const displayComplete = $derived(Boolean(snapshot));
	let highlights = $state<DocumentHighlightController>();
	let clauseInteractions = $state<DocumentClauseInteractions>();
	let highlightRects = $state.raw<PageHighlights>(new Map());
	$effect(() => {
		const stage = viewer.documentStageElement;
		if (!stage || !displayComplete) return;
		const controller = new DocumentHighlightController(stage);
		const interactions = new DocumentClauseInteractions(stage, controller, selectAnnotation);
		clauseInteractions = interactions;
		highlights = controller;
		const unsubscribe = controller.subscribe((rects) => {
			highlightRects = rects;
		});
		return () => {
			unsubscribe();
			interactions.destroy();
			controller.destroy();
			clauseInteractions = undefined;
			highlights = undefined;
			highlightRects = new Map();
			authoringRanges.clear();
		};
	});
	$effect(() => {
		const root = viewer.documentStageElement,
			commit = snapshot,
			controller = highlights;
		void commit;
		if (!root || !controller) return;
		if (commit) controller.contentCommitted(commit.layoutEpoch, commit.changedPages);
	});
	$effect(() => {
		void pageScale;
		highlights?.projectionChanged();
	});
	const authoringRanges = new Map<
		SourceRange,
		{
			sourceIndex: NonNullable<typeof snapshot>['source']['sourceIndex'];
			ranges: Range[];
			pages: readonly NonNullable<typeof snapshot>['pages'][number][];
		}
	>();
	$effect(() => {
		const root = viewer.documentStageElement,
			commit = snapshot,
			controller = highlights;
		if (!root || !commit || !controller) return;
		const selected = new Set(selectedRanges);
		for (const range of authoringRanges.keys())
			if (!selected.has(range)) authoringRanges.delete(range);
		const ranges = selectedRanges.flatMap((sourceRange) => {
			const index = commit.source.sourceIndex;
			let start: number, end: number;
			try {
				start = pointPosition(index, sourceRange.start);
				end = pointPosition(index, sourceRange.end);
			} catch {
				authoringRanges.delete(sourceRange);
				return [];
			}
			const keys = new Set(
				(start < end ? unitsInRange(index, sourceRange) : []).map((unit) => unit.blockKey)
			);
			const pages = commit.pages.filter((page) =>
				page.placements.some(({ fragment }) => keys.has(fragment.blockKey))
			);
			let cached = authoringRanges.get(sourceRange);
			if (
				!cached ||
				cached.sourceIndex !== index ||
				cached.ranges.some(
					(range) => !root.contains(range.startContainer) || !root.contains(range.endContainer)
				) ||
				cached.pages.length !== pages.length ||
				cached.pages.some((page, i) => page !== pages[i])
			) {
				cached = {
					sourceIndex: index,
					ranges: sourceRangeToDomRanges(root, sourceRange, index),
					pages
				};
				authoringRanges.set(sourceRange, cached);
			}
			return cached.ranges;
		});
		controller.setGroup('authoring', 'authoring-selection', ranges);
	});
	$effect(() => {
		const stage = viewer.documentStageElement;
		if (!stage) return;
		let scrollVersion = 0;
		const onScroll = () => scrollVersion++;
		window.addEventListener('scroll', onScroll, { passive: true });
		const unsubscribe = renderer.beforeCommit(() => {
			const viewportTop = getDocumentViewportMetrics().top;
			let token: HTMLElement | undefined;
			// Search only visible pages; the page margin may contain no source-bearing text.
			for (const page of stage.querySelectorAll<HTMLElement>('[data-page-number]')) {
				const bounds = page.getBoundingClientRect();
				if (bounds.bottom <= viewportTop) continue;
				if (bounds.top >= window.innerHeight) break;
				for (const span of page.querySelectorAll<HTMLElement>(
					'[data-source-start-key]:not([data-generated])'
				)) {
					if (span.dataset.revision && span.dataset.revision !== 'removed') continue;
					const bounds = span.getBoundingClientRect();
					if (bounds.height && bounds.top >= viewportTop && bounds.top < window.innerHeight) {
						token = span;
						break;
					}
				}
				if (token) break;
			}
			const point = token?.dataset.sourceStartKey
				? {
						sourceKey: token.dataset.sourceStartKey,
						offset: Number(token.dataset.sourceStartOffset ?? 0)
					}
				: undefined;
			if (!point || !token || !stage.contains(token)) return;
			const occurrence = sourceOccurrence(token);
			const top = sourcePointBounds(stage, point, true, occurrence)?.top;
			const scrollY = window.scrollY;
			const capturedScrollVersion = scrollVersion;
			void tick().then(() => {
				if (
					!stage.isConnected ||
					window.scrollY !== scrollY ||
					scrollVersion !== capturedScrollVersion ||
					top === undefined
				)
					return;
				const after = sourcePointBounds(stage, point, true, occurrence)?.top;
				if (after !== undefined && Math.abs(after - top) > 0.5)
					window.scrollBy({ top: after - top, behavior: 'instant' });
			});
		});
		return () => {
			unsubscribe();
			window.removeEventListener('scroll', onScroll);
		};
	});
	const pages = $derived(snapshot?.pages ?? []);
	const requestedModel = $derived.by(() => {
		try {
			return {
				conflicts: source.renderSource
					? activeConflicts(
							source.renderSource.sourceIndex,
							source.renderSource.items,
							selectedConcessions
						)
					: [],
				error: null
			};
		} catch (cause) {
			return {
				conflicts: [],
				error: { message: 'We couldn’t validate the requested contract.', cause }
			};
		}
	});
	const hasActiveConflicts = $derived(requestedModel.conflicts.length > 0);
	const sharedProfiles = getContractLayoutProfiles();
	let surface = $state.raw<ProfileSurface>();
	const profiler = $derived(
		sharedProfiles ? sharedProfiles.profiler : surface ? new LayoutProfiler(surface) : undefined
	);
	const current = $derived(
		Boolean(
			profiler &&
			source.renderSource &&
			!requestedModel.error &&
			renderer.isCurrent({
				source: source.renderSource,
				concessions: selectedConcessions,
				profiler,
				previewChanges
			}) &&
			!renderer.pending &&
			!renderer.error &&
			!hasActiveConflicts
		)
	);
	const canOpenPlaybookItems = $derived(current && allowPlaybookNavigation && !picking);
	$effect(() => {
		clauseInteractions?.setEnabled(canOpenPlaybookItems);
	});
	let layoutElement = $state<HTMLDivElement>();
	let layoutWidth = $state(PAGE_FORMAT.width + 30);
	let panelTop = $state(0);
	let selectedOccurrence = $state.raw<AnnotationOccurrence | null>(null);
	const pageScale = $derived(
		Math.min(
			1,
			Math.max(
				280,
				layoutWidth >= SIDE_PANEL_BREAKPOINT
					? layoutWidth - SIDE_PANEL_RESERVED_WIDTH
					: layoutWidth - 30
			) / PAGE_FORMAT.width
		)
	);
	const displayWidth = $derived(PAGE_FORMAT.width * pageScale);
	const displayHeight = $derived(
		(pages.length * PAGE_FORMAT.height + Math.max(0, pages.length - 1) * PAGE_FORMAT.gap) *
			pageScale
	);
	function annotationAnchor(
		annotationId = selectedAnnotationId,
		occurrence = selectedOccurrence,
		point = panelSource
	) {
		const root = viewer.documentStageElement,
			index = snapshot?.source.sourceIndex;
		if (!root || !index) return;
		// A removed effect leaves the owning item open at its first real trigger.
		const fallbackTrigger = point
			? source.geometry
					?.triggersContainingPoint(point)
					.find(
						(trigger) =>
							trigger.range.start.sourceKey === point.sourceKey &&
							trigger.range.start.offset === point.offset
					)
			: undefined;
		const fallback = fallbackTrigger
			? [...(source.geometry?.triggerIds.get(fallbackTrigger.id) ?? [])][0]
			: undefined;
		const id =
			annotationId ?? (fallback ? triggerAnnotationId(fallback.itemId, fallback.trigger.id) : null);
		return resolveAnnotationAnchor(
			annotationRegistry,
			index,
			id,
			occurrence?.annotationId === id ? occurrence : null,
			point
		);
	}
	/** Retain source coordinates so focus can return after the editor and preview disappear. */
	function captureAnnotationFocus() {
		const id = selectedAnnotationId,
			occurrence = selectedOccurrence,
			point = panelSource;
		return () => {
			const anchor = annotationAnchor(id, occurrence, point);
			(anchor?.owner ?? viewer.documentStageElement)?.focus({ preventScroll: true });
		};
	}
	function restoreAnnotationFocus() {
		captureAnnotationFocus()();
	}
	async function positionPanel() {
		await tick();
		if (!viewer.documentStageElement || !hasPanel) return;
		const anchor = annotationAnchor();
		const bounds =
			(anchor ? annotationAnchorBounds(anchor) : null) ??
			(panelSource ? sourcePointBounds(viewer.documentStageElement, panelSource, true) : null);
		const stageTop = viewer.documentStageElement.getBoundingClientRect().top;
		panelTop = Math.max(0, (bounds?.top ?? getDocumentViewportMetrics().top) - stageTop);
	}
	function selectAnnotation(
		itemId: string,
		annotationId: string,
		activation: AnnotationActivation
	) {
		if (!canOpenPlaybookItems) return;
		if (onSelect(itemId, annotationId) === false) return;
		selectedOccurrence = annotationOccurrence(annotationId, activation);
		void positionPanel();
	}
	$effect(() => {
		const selected = selectedAnnotationId,
			open = hasPanel;
		untrack(() => {
			if (!open || selectedOccurrence?.annotationId !== selected) selectedOccurrence = null;
		});
	});
	$effect(() => {
		void snapshot?.id;
		void selectedAnnotationId;
		void selectedOccurrence;
		void panelSource;
		void hasPanel;
		void pageScale;
		void positionPanel();
	});
	async function keepPanelVisible() {
		const panel = layoutElement?.querySelector<HTMLElement>('[data-workspace-panel]');
		if (!panel || !hasPanel) return;
		await positionPanel();
		await tick();
		if (
			!hasPanel ||
			followScroll ||
			layoutElement?.querySelector('[data-workspace-panel]') !== panel
		)
			return;
		const rail = panel.parentElement;
		if (!rail || getComputedStyle(rail).position === 'fixed') return;
		const viewport = getDocumentViewportMetrics();
		const top = panel.getBoundingClientRect().top;
		if (top < viewport.top || top >= window.innerHeight - viewport.gap)
			window.scrollBy({ top: top - viewport.top, behavior: 'instant' });
	}
	let wasFollowingScroll = false;
	$effect(() => {
		const following = followScroll;
		if (wasFollowingScroll && !following) untrack(() => void keepPanelVisible());
		wasFollowingScroll = following;
	});
	$effect(() => {
		const el = layoutElement;
		if (!el) return;
		layoutWidth = el.getBoundingClientRect().width;
		const observer = new ResizeObserver(([entry]) => {
			layoutWidth = entry.contentBoxSize?.[0]?.inlineSize ?? entry.contentRect.width;
		});
		observer.observe(el);
		return () => observer.disconnect();
	});
	function retryRender() {
		if (requestedModel.error) {
			renderer.fail(requestedModel.error);
			return;
		}
		if (profiler && source.renderSource && !hasActiveConflicts)
			renderer.request({
				source: source.renderSource,
				concessions: selectedConcessions,
				previewChanges,
				profiler
			});
	}
	$effect(() => {
		const layoutProfiler = profiler,
			model = source.renderSource,
			selection = selectedConcessions,
			preview = previewChanges,
			blocked = hasActiveConflicts,
			error = requestedModel.error;
		untrack(() => {
			if (error) {
				renderer.fail(error);
				return;
			}
			if (!layoutProfiler || !model || blocked) {
				renderer.cancelPending();
				return;
			}
			if (
				renderer.isCurrent({
					source: model,
					concessions: selection,
					profiler: layoutProfiler,
					previewChanges: preview
				})
			) {
				renderer.cancelPending();
				return;
			}
			renderer.request({
				source: model,
				concessions: selection,
				previewChanges: preview,
				profiler: layoutProfiler
			});
		});
	});
	onMount(() => {
		recordColdStart('viewer-mounted');
		viewer.retry = retryRender;
		viewer.restoreAnnotationFocus = restoreAnnotationFocus;
		viewer.captureAnnotationFocus = captureAnnotationFocus;
	});
	$effect(() => {
		const layoutProfiler = profiler,
			commit = snapshot;
		if (!current || previewChanges.length || !commit || !layoutProfiler) return;
		return untrack(() => prewarmSavedConcessions(commit, layoutProfiler));
	});
	$effect(() => {
		viewer.ready = current;
		if (current) recordColdStart('interaction-ready');
	});
	onDestroy(() => {
		viewer.ready = false;
		viewer.documentStageElement = undefined;
		viewer.retry = undefined;
		viewer.restoreAnnotationFocus = undefined;
		viewer.captureAnnotationFocus = undefined;
		annotationRegistry.clear();
		renderer.destroy();
	});
</script>

{#if hasActiveConflicts}
	<div role="alert" class="mx-auto max-w-xl rounded border border-line bg-surface p-3">
		These applied concessions conflict with current contract changes. Remove an alternative to
		continue.
		{#each requestedModel.conflicts as conflict}
			{@const item = source.items?.find((item) => item._id === conflict.itemId)}
			{@const concession = item?.concessions.find(
				(concession) => concession.id === conflict.concession.id
			)}
			<button class="ml-2 underline" onclick={() => onRemoveConcession(conflict.itemId)}
				>Remove “{concession?.description ?? conflict.concession.id}”{item?.instructions?.summary
					? ` — ${item.instructions.summary}`
					: ''}</button
			>{/each}
	</div>
{/if}
{#if !sharedProfiles}<LayoutProfileSurface bind:surface />{/if}
{#if !pages.length && !renderer.error}
	<LoadingPagination />
{:else if !pages.length}
	<div
		class="flex min-h-[calc(100vh-100px)] flex-col items-center justify-center gap-1.5 text-center text-ink-secondary"
		role="alert"
	>
		<strong>We couldn’t display this contract.</strong>
		<button type="button" class="underline" onclick={retryRender}>Retry</button>
	</div>
{:else}
	<div
		class="viewer-root w-full"
		data-document-commit={snapshot?.id}
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
					{#each pages as page (page.number)}
						<DocumentPage
							{page}
							highlights={highlightRects.get(page.number) ?? EMPTY_HIGHLIGHTS}
							{selectedAnnotationId}
							{canOpenPlaybookItems}
							onAnnotationSelect={selectAnnotation}
						/>
					{/each}
				</div>
			</div>
		{/snippet}
		<ContractWorkspaceLayout
			{hasPanel}
			{followScroll}
			displayedPageWidth={displayWidth}
			documentHeight={displayHeight}
			{panelTop}
			bind:layoutElement
			bind:documentStageElement={viewer.documentStageElement}
			{documentContent}
			{panelContent}
		/>
	</div>
{/if}
