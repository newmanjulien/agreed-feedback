<script lang="ts">
	import RetainedViewer from '$lib/components/document/RetainedViewer.svelte';
	import { DocumentResources, setDocumentResources } from '$lib/document/runtime/resources.svelte';
	import { env } from '$env/dynamic/public';
	import { browser } from '$app/environment';
	import { beforeNavigate, afterNavigate, onNavigate } from '$app/navigation';
	import { createAdminQueries, setAdminQueries } from '$lib/contract/admin-queries.svelte';
	import {
		getContractSnapshotCache,
		releaseContractSnapshotCache
	} from '$lib/contract/snapshot-cache';
	import {
		recordDocumentNavigation,
		cancelDocumentNavigation
	} from '$lib/document/runtime/render-perf';
	import LayoutProfileSurface from '$lib/components/document/LayoutProfileSurface.svelte';
	import {
		ContractLayoutProfiles,
		setContractLayoutProfiles
	} from '$lib/document/runtime/layout-context.svelte';
	import { setupConvex } from 'convex-svelte';
	import { onMount, onDestroy, type Snippet } from 'svelte';
	import { InteractionController, setInteractionController } from '$lib/components/ui/interactions';
	let { children }: { children: Snippet } = $props();
	const interactions = setInteractionController(new InteractionController());
	onMount(() => interactions.mount());
	if (env.PUBLIC_CONVEX_URL) setupConvex(env.PUBLIC_CONVEX_URL);
	const admin = setAdminQueries(createAdminQueries(Boolean(env.PUBLIC_CONVEX_URL)));
	onMount(() => getContractSnapshotCache().allowBackground());
	onMount(() => releaseContractSnapshotCache);
	beforeNavigate((navigation) => {
		if (navigation.to) recordDocumentNavigation(navigation.to.url.pathname);
	});
	afterNavigate((navigation) => {
		if (!navigation.to) return;
		if (browser && navigation.type === 'enter')
			recordDocumentNavigation(navigation.to.url.pathname, 0);
		else if (navigation.to.url.pathname === '/') cancelDocumentNavigation();
	});
	// A persistent host preserves the existing mount-specific epoch safety.
	// Disable independently to return to viewer-owned, fresh geometry.
	const layoutProfiles =
		env.PUBLIC_CONTRACT_ROUTE_PROFILES === '0'
			? undefined
			: setContractLayoutProfiles(new ContractLayoutProfiles());
	const resources =
		layoutProfiles && env.PUBLIC_CONTRACT_DOCUMENT_PREPARATION !== '0'
			? setDocumentResources(new DocumentResources(layoutProfiles, admin))
			: undefined;
	onNavigate(({ to }) => {
		const path = to?.url.pathname;
		const id = path === '/admin' ? 'admin' : path?.match(/^\/contracts\/([^/]+)\/?$/)?.[1];
		if (id && id !== 'admin' && id !== 'new') void getContractSnapshotCache().load(id);
		return id ? resources?.beginOpen(id) : undefined;
	});
	onMount(() =>
		resources
			? getContractSnapshotCache().subscribe(
					(data) => resources.prepare(data),
					(id) => resources.remove(id),
					(id) => resources.failedPreparation(id)
				)
			: undefined
	);
	onDestroy(() => {
		resources?.destroy();
		layoutProfiles?.scheduler.destroy();
	});
</script>

{#if layoutProfiles}<LayoutProfileSurface bind:surface={layoutProfiles.surface} />{/if}
{@render children()}

{#if resources}{#each resources.entries as entry (entry)}<RetainedViewer {entry} />{/each}{/if}
