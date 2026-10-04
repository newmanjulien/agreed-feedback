<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import type { VirtualElement } from '@floating-ui/dom';
	import FloatingSurface from '$lib/components/ui/FloatingSurface.svelte';
	import Tooltip from '$lib/components/ui/Tooltip.svelte';
	import type { RenderSnapshot } from '$lib/document/runtime/types';
	import type { SourceRange } from '$lib/playbook/model';
	import type {
		AuthoringMode,
		SelectionIssue,
		SelectionEligibility
	} from '$lib/playbook/source-picking';
	import { getDocumentHighlights } from '$lib/document/highlights/controller';
	import { finalLineBounds } from '$lib/document/highlights/geometry';
	import { mapSelection } from '$lib/document/selection/dom-selection';
	import { createSelectionGesture } from '$lib/document/selection/selection-gesture';
	import ArticleIcon from 'phosphor-svelte/lib/ArticleIcon';
	import LightningIcon from 'phosphor-svelte/lib/LightningIcon';
	import SquareIconButton from '$lib/components/ui/SquareIconButton.svelte';

	let {
		container,
		snapshot,
		enabled,
		autoConfirm = false,
		onSelectionIssue,
		onGestureStart,
		evaluate,
		onConfirm
	}: {
		container?: HTMLElement;
		snapshot: RenderSnapshot;
		enabled: boolean;
		autoConfirm?: boolean;
		onSelectionIssue: (issue: SelectionIssue | null) => void;
		onGestureStart: () => void;
		evaluate: (range: SourceRange) => SelectionEligibility;
		onConfirm: (range: SourceRange, mode?: AuthoringMode) => boolean;
	} = $props();
	const actions = [
		{ mode: 'explain', label: 'Explain a clause', icon: ArticleIcon },
		{ mode: 'concession', label: 'Add concession', icon: LightningIcon }
	] as const;
	const index = $derived(snapshot.source.sourceIndex);
	let canConcede = $state(false);
	type SelectionEndpoints = {
		startNode: Node;
		startOffset: number;
		endNode: Node;
		endOffset: number;
	};
	let acceptedRange: SourceRange | null = null;
	let acceptedEndpoints: SelectionEndpoints | null = null;
	function selectionEndpoints(selection = window.getSelection()): SelectionEndpoints | null {
		if (!selection || selection.rangeCount !== 1 || selection.isCollapsed) return null;
		const range = selection.getRangeAt(0);
		return {
			startNode: range.startContainer,
			startOffset: range.startOffset,
			endNode: range.endContainer,
			endOffset: range.endOffset
		};
	}
	function selectionUnchanged() {
		const current = selectionEndpoints();
		return Boolean(
			current &&
			acceptedEndpoints &&
			current.startNode === acceptedEndpoints.startNode &&
			current.startOffset === acceptedEndpoints.startOffset &&
			current.endNode === acceptedEndpoints.endNode &&
			current.endOffset === acceptedEndpoints.endOffset
		);
	}
	function invalidateSelection() {
		anchor = null;
		acceptedRange = null;
		acceptedEndpoints = null;
	}
	function selectionUpdated() {
		if (!selectionUnchanged()) invalidateSelection();
		scheduleUpdate();
	}
	function currentSelection(selection = window.getSelection()) {
		if (!enabled || !selection || !container) return null;
		return mapSelection(selection, container, index);
	}
	$effect(() => {
		void snapshot;
		void enabled;
		void container;
		void autoConfirm;
		untrack(() => {
			gesture?.reset();
			cancelUpdate();
			invalidateSelection();
			if (!enabled) clearContractSelection();
			else scheduleUpdate();
		});
	});

	let anchor = $state<VirtualElement | null>(null);
	const actionButtons = $state<Partial<Record<AuthoringMode, HTMLButtonElement>>>({});
	let frameId: number | null = null;
	let gesture: ReturnType<typeof createSelectionGesture> | undefined;

	function cancelUpdate() {
		if (frameId === null) return;
		cancelAnimationFrame(frameId);
		frameId = null;
	}

	function clearContractSelection() {
		const selection = window.getSelection();
		if (
			selection &&
			((selection.anchorNode && container?.contains(selection.anchorNode)) ||
				(selection.focusNode && container?.contains(selection.focusNode)))
		) {
			selection.removeAllRanges();
		}
	}

	function updateAnchor() {
		frameId = null;
		if (!enabled || autoConfirm) {
			anchor = null;
			return;
		}
		if (gesture?.selecting) return;

		const selection = window.getSelection();
		if (!container || !selection || selection.rangeCount !== 1 || selection.isCollapsed) {
			anchor = null;
			return;
		}

		const range = selection.getRangeAt(0);
		if (!acceptedRange || !selectionUnchanged()) {
			invalidateSelection();
			anchor = null;
			return;
		}

		const controller = getDocumentHighlights(container);
		const last = controller
			? controller.finalLineBounds([range])
			: finalLineBounds(container, [range]);
		if (!last) {
			anchor = null;
			return;
		}
		// The reference is always measured from current accepted endpoints. Positioning belongs to UI.
		if (!anchor)
			anchor = {
				contextElement: container,
				getBoundingClientRect: () => {
					if (!selectionUnchanged() || !container) return new DOMRect();
					const current = window.getSelection()!.getRangeAt(0);
					const highlights = getDocumentHighlights(container);
					return (
						(highlights
							? highlights.finalLineBounds([current])
							: finalLineBounds(container, [current])) ?? new DOMRect()
					);
				}
			};
	}

	function scheduleUpdate() {
		if (gesture?.selecting || frameId !== null) return;
		frameId = requestAnimationFrame(updateAnchor);
	}

	function dismiss() {
		cancelUpdate();
		invalidateSelection();
		onSelectionIssue(null);
		clearContractSelection();
	}

	function confirm(mode?: AuthoringMode) {
		cancelUpdate();
		if (!enabled || !acceptedRange || !selectionUnchanged()) {
			invalidateSelection();
			return;
		}
		// The workflow owns confirmation-time validation and feedback.
		const accepted = onConfirm(acceptedRange, mode);
		invalidateSelection();
		if (accepted) clearContractSelection();
	}

	function completeSelection() {
		const selection = window.getSelection();
		if (!enabled || !selection || selection.isCollapsed || !selection.toString().trim()) return;
		const range = currentSelection(selection);
		if (!range) {
			onSelectionIssue({ kind: 'unmappable' });
			return;
		}
		if (autoConfirm) {
			acceptedRange = range;
			acceptedEndpoints = selectionEndpoints(selection);
			confirm();
			return;
		}
		const permission = evaluate(range);
		if (!permission.allowed) {
			onSelectionIssue(permission.issue);
			return;
		}
		onSelectionIssue(null);
		acceptedRange = range;
		acceptedEndpoints = selectionEndpoints(selection);
		canConcede = permission.modes.includes('concession');
		scheduleUpdate();
	}

	onMount(() => {
		gesture = createSelectionGesture({
			getContainer: () => (enabled ? container : undefined),
			onSelectionUpdate: selectionUpdated,
			onGestureStart: () => {
				cancelUpdate();
				invalidateSelection();
				onGestureStart();
			},
			onComplete: completeSelection,
			onCancel: dismiss
		});
		return () => {
			gesture?.destroy();
			cancelUpdate();
		};
	});
</script>

{#if enabled && !autoConfirm && anchor}
	<FloatingSurface
		open={true}
		{anchor}
		onClose={dismiss}
		placement="bottom"
		gap={10}
		referenceClipping="hide"
		role="group"
		label="Text selection actions"
		class="flex h-[34px] items-center rounded-xl border border-line bg-surface p-0.5"
		onpointerdown={(event) => event.preventDefault()}
	>
		{#each actions.slice(0, canConcede ? 2 : 1) as action (action.mode)}
			<Tooltip text={action.label} trigger={actionButtons[action.mode]} standalone={false}>
				{#snippet children(descriptionId)}
					<SquareIconButton
						bind:element={actionButtons[action.mode]}
						size="sm"
						rounded="lg"
						type="button"
						aria-describedby={descriptionId}
						onclick={() => {
							gesture?.reset();
							confirm(action.mode);
						}}
						aria-label={action.label}
					>
						<action.icon aria-hidden="true" size={20} weight="regular" />
					</SquareIconButton>
				{/snippet}
			</Tooltip>
		{/each}
	</FloatingSurface>
{/if}
