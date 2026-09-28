<script lang="ts">
	import ContractApp from '$lib/components/document/ContractApp.svelte';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Agreed</title>
	<meta
		name="description"
		content="Let sales reps understand, negotiate and close contracts on their own."
	/>
</svelte:head>

{#if data.blocks.error || data.boxes.error}
	<p role="alert">We couldn’t load this contract. Please refresh to try again.</p>
{:else if data.blocks.data && data.boxes.data}
	<ContractApp blocks={data.blocks.data} boxes={data.boxes.data} />
{:else}
	<p role="status">Loading contract…</p>
{/if}
