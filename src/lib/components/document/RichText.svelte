<script lang="ts">
	import type { InlineToken } from '$lib/document/pagination/types';

	let { nodes }: { nodes: ReadonlyArray<Pick<InlineToken, 'value' | 'marks'>> } = $props();
</script>

{#each nodes as node}
	{#if node.marks?.bold && node.marks?.italic}
		<strong><em>{node.value}</em></strong>
	{:else if node.marks?.bold}
		<strong>{node.value}</strong>
	{:else if node.marks?.italic}
		<em>{node.value}</em>
	{:else}{node.value}{/if}
{/each}
