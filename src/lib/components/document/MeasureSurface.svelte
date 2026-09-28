<script lang="ts">
	import { flushSync, onMount } from 'svelte';
	import { PAGE_FORMAT } from '$lib/document/pagination/page-format';
	import type { PageFragment, PageMeasurement } from '$lib/document/pagination/types';
	import BlockFragment from './BlockFragment.svelte';

	let {
		measurement = $bindable(),
		activeClauseKeys
	}: {
		measurement?: PageMeasurement;
		activeClauseKeys: ReadonlySet<string>;
	} = $props();
	let element: HTMLDivElement;
	let fragments = $state.raw<PageFragment[]>([]);
	let pageNumber = $state(1);
	const ignoreClauseSelect = () => {};

	onMount(() => {
		measurement = {
			fits(nextFragments, pageIndex) {
				flushSync(() => {
					fragments = nextFragments;
					pageNumber = pageIndex + 1;
				});
				const topPadding = pageIndex === 0 ? PAGE_FORMAT.firstTopPadding : PAGE_FORMAT.topPadding;
				const capacity = PAGE_FORMAT.height - topPadding - PAGE_FORMAT.bottomPadding;
				return element.scrollHeight <= capacity + 0.5;
			}
		};
		return () => {
			measurement = undefined;
		};
	});
</script>

<div
	class="measurement-surface contract-document contract-flow"
	aria-hidden="true"
	inert
	bind:this={element}
	style:--contract-content-width={`${PAGE_FORMAT.contentWidth}px`}
>
	{#each fragments as fragment}
		<BlockFragment
			{fragment}
			{pageNumber}
			selectedOccurrenceKey={null}
			{activeClauseKeys}
			onClauseSelect={ignoreClauseSelect}
		/>
	{/each}
</div>
