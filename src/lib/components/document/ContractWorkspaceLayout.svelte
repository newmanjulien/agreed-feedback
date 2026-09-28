<script lang="ts">
	import type { Snippet } from 'svelte';
	import { RAIL_SAFE_GUTTER, BOX_MIN_WIDTH, BOX_GAP, RIGHT_GUTTER } from './workspace-layout';

	let {
		hasClauseBox,
		displayedPageWidth,
		documentHeight,
		boxTop,
		layoutElement = $bindable(),
		documentStageElement = $bindable(),
		documentContent,
		clauseBoxContent
	}: {
		hasClauseBox: boolean;
		displayedPageWidth: number;
		documentHeight: number;
		boxTop: number;
		layoutElement?: HTMLDivElement;
		documentStageElement?: HTMLDivElement;
		documentContent: Snippet;
		clauseBoxContent: Snippet;
	} = $props();
</script>

<div
	class="contract-workspace-layout"
	bind:this={layoutElement}
	class:has-clause-box={hasClauseBox}
	style:--page-width={`${displayedPageWidth}px`}
	style:--page-half-width={`${displayedPageWidth / 2}px`}
	style:--box-top={`${boxTop}px`}
	style:--rail-safe-gutter={`${RAIL_SAFE_GUTTER}px`}
	style:--box-min-width={`${BOX_MIN_WIDTH}px`}
	style:--box-gap={`${BOX_GAP}px`}
	style:--right-gutter={`${RIGHT_GUTTER}px`}
	style:min-height={`${documentHeight}px`}
>
	<div class="document-column" style:width={`${displayedPageWidth}px`}>
		<div
			class="document-stage"
			bind:this={documentStageElement}
			tabindex="-1"
			style:width={`${displayedPageWidth}px`}
			style:height={`${documentHeight}px`}
		>
			{@render documentContent()}
		</div>
	</div>

	{#if hasClauseBox}
		<div class="clause-box-anchor">
			{@render clauseBoxContent()}
		</div>
	{/if}
</div>

<style>
	.contract-workspace-layout {
		--box-max-width: 480px;
		--box-width: clamp(
			var(--box-min-width),
			calc(
				100cqw - var(--rail-safe-gutter) - var(--page-width) - var(--box-gap) - var(--right-gutter)
			),
			var(--box-max-width)
		);
		--centered-page-left: calc(50cqw - var(--page-half-width));
		--right-anchored-page-left: calc(
			100cqw - var(--right-gutter) - var(--box-width) - var(--box-gap) - var(--page-width)
		);
		--page-left: min(var(--centered-page-left), var(--right-anchored-page-left));
		--page-shift: calc(var(--page-left) - var(--centered-page-left));
		position: relative;
		width: 100%;
		container-type: inline-size;
	}

	.document-column {
		margin-inline: auto;
		transition: transform 180ms ease;
	}

	.document-stage {
		position: relative;
	}

	.clause-box-anchor {
		position: absolute;
		top: var(--box-top);
		right: var(--box-gap);
		z-index: 5;
		width: var(--box-width);
		animation: box-in 140ms ease both;
	}

	/* Keep this threshold in sync with SIDE_BOX_BREAKPOINT and ClauseBox's sheet layout. */
	@container (width >= 1150px) {
		.has-clause-box .document-column {
			transform: translateX(var(--page-shift));
		}

		.has-clause-box .clause-box-anchor {
			right: auto;
			left: calc(var(--page-left) + var(--page-width) + var(--box-gap));
		}
	}

	@container (width < 1150px) {
		.has-clause-box .clause-box-anchor {
			position: fixed;
			top: auto;
			right: 0;
			bottom: 0;
			left: 0;
			z-index: 30;
			width: auto;
			animation-name: sheet-in;
		}
	}

	@keyframes box-in {
		from {
			opacity: 0;
			transform: translateY(3px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@keyframes sheet-in {
		from {
			opacity: 0;
			transform: translateY(16px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.document-column {
			transition: none;
		}

		.clause-box-anchor {
			animation: none;
		}
	}
</style>
