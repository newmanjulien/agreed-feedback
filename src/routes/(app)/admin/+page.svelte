<script lang="ts">
	import AdminWorkspace from '$lib/components/workspace/AdminWorkspace.svelte';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Add and edit contract instructions | Agreed</title></svelte:head>
<AdminWorkspace {data} />
