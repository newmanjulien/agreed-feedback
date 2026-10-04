<script lang="ts">
	import type { InlineToken } from '$lib/document/pagination/types';
	import { groupRevisionRuns } from '$lib/document/revision-runs';
	import SourceText from './SourceText.svelte';
	let { tokens, profileMode = false }: { tokens: readonly InlineToken[]; profileMode?: boolean } =
		$props();
	let runs = $derived(groupRevisionRuns(tokens));
</script>

{#each runs as run}
	{#if run.revision === 'removed'}
		<del class="contract-revision-removed"><SourceText tokens={run.tokens} {profileMode} /></del>
	{:else if run.revision === 'added'}
		<ins class="contract-revision-added"><SourceText tokens={run.tokens} {profileMode} /></ins>
	{:else}
		<SourceText tokens={run.tokens} {profileMode} />
	{/if}
{/each}
