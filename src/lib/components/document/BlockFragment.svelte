<script lang="ts">
	import InlineContent from './InlineContent.svelte';
	import type { PageFragment } from '$lib/document/pagination/types';

	let {
		fragment,
		pageNumber,
		selectedOccurrenceKey,
		activeClauseKeys,
		onClauseSelect
	}: {
		fragment: PageFragment;
		pageNumber: number;
		selectedOccurrenceKey: string | null;
		activeClauseKeys: ReadonlySet<string>;
		onClauseSelect: (clauseKey: string, occurrenceKey: string, fragmentKey: string) => void;
	} = $props();

	let blockFragmentKey = $derived(`page-${pageNumber}:${fragment.blockKey}`);

	function handleCellPaddingClick(event: MouseEvent) {
		if (event.target !== event.currentTarget) return;
		(event.currentTarget as HTMLElement).querySelector<HTMLElement>('.contract-clause')?.click();
	}
</script>

{#if fragment.type === 'heading'}
	<svelte:element
		this={`h${fragment.level}`}
		id={fragment.anchor}
		class="contract-block contract-heading"
		data-block-key={fragment.blockKey}
		tabindex="-1"
	>
		<InlineContent
			tokens={fragment.tokens}
			{blockFragmentKey}
			{selectedOccurrenceKey}
			{activeClauseKeys}
			{onClauseSelect}
		/>
	</svelte:element>
{:else if fragment.type === 'paragraph'}
	<p
		class="contract-block contract-paragraph"
		class:is-continuation={fragment.isContinuation}
		class:is-final={fragment.isFinal}
		class:is-empty-insertion-slot={fragment.emptyInsertionSlot}
		data-block-key={fragment.blockKey}
	>
		<InlineContent
			tokens={fragment.tokens}
			{blockFragmentKey}
			{selectedOccurrenceKey}
			{activeClauseKeys}
			{onClauseSelect}
		/>
	</p>
{:else}
	<table
		class="contract-block contract-table"
		class:signature-table={fragment.variant === 'signature'}
		data-block-key={fragment.blockKey}
	>
		<thead>
			{#each fragment.rows.slice(0, fragment.headerRowCount) as row, rowIndex}
				<tr
					>{#each row as cell, cellIndex}
						{@const hasActiveClause = cell.tokens.some(
							(token) => token.clauseKey && activeClauseKeys.has(token.clauseKey)
						)}
						<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
						<th
							scope="col"
							class:clause-cell={hasActiveClause}
							onclick={hasActiveClause ? handleCellPaddingClick : undefined}
						>
							<InlineContent
								tokens={cell.tokens}
								blockFragmentKey={`${blockFragmentKey}:row-${rowIndex}:cell-${cellIndex}`}
								{selectedOccurrenceKey}
								{activeClauseKeys}
								{onClauseSelect}
							/>
						</th>{/each}</tr
				>
			{/each}
		</thead>
		<tbody>
			{#each fragment.rows.slice(fragment.headerRowCount) as row, rowIndex}
				<tr
					>{#each row as cell, cellIndex}
						{@const hasActiveClause = cell.tokens.some(
							(token) => token.clauseKey && activeClauseKeys.has(token.clauseKey)
						)}
						<!-- The inner clause handles keyboard input; this forwards clicks on the cell padding. -->
						<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
						<td
							class:clause-cell={hasActiveClause}
							onclick={hasActiveClause ? handleCellPaddingClick : undefined}
						>
							<InlineContent
								tokens={cell.tokens}
								blockFragmentKey={`${blockFragmentKey}:row-${rowIndex + fragment.headerRowCount}:cell-${cellIndex}`}
								{selectedOccurrenceKey}
								{activeClauseKeys}
								{onClauseSelect}
							/>
						</td>{/each}</tr
				>
			{/each}
		</tbody>
	</table>
{/if}
