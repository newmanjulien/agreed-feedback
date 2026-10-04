<script lang="ts">
	import { setDocumentDomain } from '$lib/document/domain/context';
	import { env } from '$env/dynamic/public';
	import LayoutProfileSurface from '$lib/components/document/LayoutProfileSurface.svelte';
	import {
		ContractLayoutProfiles,
		setContractLayoutProfiles
	} from '$lib/document/runtime/layout-context.svelte';
	import { setupConvex } from 'convex-svelte';
	import { onMount, type Snippet } from 'svelte';
	import { InteractionController, setInteractionController } from '$lib/components/ui/interactions';
	let { children }: { children: Snippet } = $props();
	setDocumentDomain();
	const interactions = setInteractionController(new InteractionController());
	onMount(() => interactions.mount());
	if (env.PUBLIC_CONVEX_URL) setupConvex(env.PUBLIC_CONVEX_URL);
	// A persistent host preserves the existing mount-specific epoch safety.
	// Disable independently to return to viewer-owned, fresh geometry.
	const layoutProfiles =
		env.PUBLIC_CONTRACT_ROUTE_PROFILES === '0'
			? undefined
			: setContractLayoutProfiles(new ContractLayoutProfiles());
</script>

{#if layoutProfiles}<LayoutProfileSurface bind:surface={layoutProfiles.surface} />{/if}
{@render children()}
