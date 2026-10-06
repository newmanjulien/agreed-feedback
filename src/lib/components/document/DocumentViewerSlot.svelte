<script lang="ts">
	import type { DocumentResource, ViewerBindings } from '$lib/document/runtime/resources.svelte';
	import LoadingPagination from './LoadingPagination.svelte';
	import ContractViewer from './ContractViewer.svelte';
	let { entry, ...bindings }: ViewerBindings & { entry?: DocumentResource } = $props();
	let target = $state<HTMLDivElement>();
	$effect(() => {
		if (!entry) return;
		const resource = entry,
			owned = bindings,
			host = target;
		resource.bindings = owned;
		resource.target = host;
		return () => {
			if (resource.bindings !== owned) return;
			resource.bindings = undefined;
			if (resource.target === host) resource.target = undefined;
		};
	});
</script>

{#if entry}
	<div bind:this={target}></div>
	{#if !entry.workspace.viewer.visible && !entry.workspace.renderer.error && !entry.workspace.viewer.preparationBlocked}<LoadingPagination
		/>{/if}
{:else}
	<ContractViewer {...bindings} />
{/if}
