<script lang="ts">
	import BlockFragment from './BlockFragment.svelte';
	import type { PageLayout } from '$lib/document/pagination/types';

	let {
		page,
		selectedOccurrenceKey,
		activeClauseKeys,
		onClauseSelect
	}: {
		page: PageLayout;
		selectedOccurrenceKey: string | null;
		activeClauseKeys: ReadonlySet<string>;
		onClauseSelect: (clauseKey: string, occurrenceKey: string, clauseFragmentKey: string) => void;
	} = $props();
</script>

<article
	class="document-page"
	class:first-page={page.number === 1}
	aria-label={`Page ${page.number}`}
>
	<div class="document-page__content contract-document contract-flow">
		{#each page.fragments as fragment}
			<BlockFragment
				{fragment}
				pageNumber={page.number}
				{selectedOccurrenceKey}
				{activeClauseKeys}
				{onClauseSelect}
			/>
		{/each}
	</div>
	<div class="document-page__number" aria-hidden="true">
		{page.number}
	</div>
</article>
