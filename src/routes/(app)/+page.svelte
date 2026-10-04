<script lang="ts">
	import RepWorkspace from '$lib/components/workspace/RepWorkspace.svelte';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<svelte:head
	><title>Agreed</title><meta
		name="description"
		content="Understand and negotiate contracts with your playbook."
	/></svelte:head
>
<RepWorkspace {data} />
