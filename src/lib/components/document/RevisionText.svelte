<script lang="ts">
	import type { InlineToken } from '$lib/document/pagination/types';
	import { groupRevisionRuns } from '$lib/document/revision-runs';
	import RichText from './RichText.svelte';

	let { tokens }: { tokens: InlineToken[] } = $props();
	let runs = $derived(groupRevisionRuns(tokens));
</script>

{#each runs as run}
	{#if run.revision === 'removed'}
		<del
			class="contract-revision-removed"
			class:revision-bold={run.tokens[0].marks?.bold}
			class:revision-italic={run.tokens[0].marks?.italic}
			>{run.tokens.map((token) => token.value).join('')}</del
		>
	{:else if run.revision === 'added'}
		<ins class="contract-revision-added"><RichText nodes={run.tokens} /></ins>
	{:else}
		<RichText nodes={run.tokens} />
	{/if}
{/each}
