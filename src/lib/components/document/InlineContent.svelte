<script lang="ts">
	import type { InlineToken } from '$lib/document/pagination/types';
	import RevisionText from './RevisionText.svelte';

	interface Segment {
		clauseKey?: string;
		occurrenceKey?: string;
		fragmentKey?: string;
		tokens: InlineToken[];
	}

	let {
		tokens,
		blockFragmentKey,
		selectedOccurrenceKey,
		activeClauseKeys,
		onClauseSelect
	}: {
		tokens: InlineToken[];
		blockFragmentKey: string;
		selectedOccurrenceKey: string | null;
		activeClauseKeys: ReadonlySet<string>;
		onClauseSelect: (clauseKey: string, occurrenceKey: string, fragmentKey: string) => void;
	} = $props();

	function segmentTokensByClause(items: InlineToken[], keyBase: string): Segment[] {
		const segments: Segment[] = [];
		for (const token of items) {
			const previous = segments.at(-1);
			if (previous && previous.occurrenceKey === token.occurrenceKey) {
				previous.tokens.push(token);
				continue;
			}
			const segmentIndex = segments.length;
			segments.push({
				...(token.clauseKey && token.occurrenceKey
					? {
							clauseKey: token.clauseKey,
							occurrenceKey: token.occurrenceKey,
							fragmentKey: `${keyBase}:clause-${segmentIndex}`
						}
					: {}),
				tokens: [token]
			});
		}
		return segments;
	}

	function handleKeydown(
		event: KeyboardEvent,
		clauseKey: string,
		occurrenceKey: string,
		fragmentKey: string
	) {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		onClauseSelect(clauseKey, occurrenceKey, fragmentKey);
	}

	function handleClick(clauseKey: string, occurrenceKey: string, fragmentKey: string) {
		const selection = window.getSelection();
		if (selection && !selection.isCollapsed) return;
		onClauseSelect(clauseKey, occurrenceKey, fragmentKey);
	}

	let segments = $derived(segmentTokensByClause(tokens, blockFragmentKey));
</script>

{#each segments as segment}
	{#if segment.clauseKey && segment.occurrenceKey && segment.fragmentKey && activeClauseKeys.has(segment.clauseKey)}
		<span
			class="contract-clause"
			role="button"
			tabindex="0"
			aria-label={segment.tokens.every((token) => !token.value.trim())
				? 'Open clause options'
				: undefined}
			aria-pressed={selectedOccurrenceKey === segment.occurrenceKey}
			data-clause-key={segment.clauseKey}
			data-occurrence-key={segment.occurrenceKey}
			data-clause-fragment-key={segment.fragmentKey}
			onclick={() => handleClick(segment.clauseKey!, segment.occurrenceKey!, segment.fragmentKey!)}
			onkeydown={(event) =>
				handleKeydown(event, segment.clauseKey!, segment.occurrenceKey!, segment.fragmentKey!)}
		>
			<RevisionText tokens={segment.tokens} />
		</span>
	{:else if segment.clauseKey && segment.occurrenceKey}
		<span class="contract-clause contract-clause--inactive"
			><RevisionText tokens={segment.tokens} /></span
		>
	{:else}
		<RevisionText tokens={segment.tokens} />
	{/if}
{/each}
