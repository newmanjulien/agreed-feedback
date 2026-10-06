<script lang="ts">
	import { onMount, onDestroy, untrack, tick } from 'svelte';
	import { useQuery } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import type { ContractRouteData } from '$lib/contract/saved';
	import { getContractSnapshotCache } from '$lib/contract/snapshot-cache';
	import { getDocumentResources } from '$lib/document/runtime/resources.svelte';
	import { recordColdStart } from '$lib/document/runtime/render-perf';
	import AppHeader from '$lib/components/chrome/AppHeader.svelte';
	import LoadingPagination from '$lib/components/document/LoadingPagination.svelte';
	import RepWorkspace from './RepWorkspace.svelte';
	let { id, onVisible, onFailure }: { id: string; onVisible?: () => void; onFailure?: () => void } =
		$props();
	let mounted = $state(false);
	let snapshot = $state.raw<ContractRouteData>();
	let ready = $state.raw<Extract<ContractRouteData, { status: 'ready' }>>();
	let attempt = $state(0);
	let notifiedFailure = false;
	const resources = getDocumentResources();
	// This owner survives initialization and supplies the workspace's editing state.
	const metadata = useQuery(api.savedContracts.state, () => (mounted ? { id } : 'skip'));
	onMount(() => {
		mounted = true;
	});
	$effect(() => {
		if (!mounted) return;
		const currentId = id;
		attempt;
		let active = true;
		void getContractSnapshotCache()
			.load(currentId)
			.then((data) => {
				if (active) snapshot = data;
			});
		return () => {
			active = false;
		};
	});
	$effect(() => {
		if (mounted && metadata.data === null) untrack(() => getContractSnapshotCache().remove(id));
	});
	let releaseOpening: (() => void) | undefined;
	onDestroy(() => releaseOpening?.());
	$effect(() => {
		const data = snapshot;
		const state = metadata.data;
		const error = metadata.error;
		if (!data || ready) return;
		untrack(() => {
			if (data.status !== 'ready' || state === null || error) return;
			// Cached selections may be prepared offscreen while validation is pending.
			if (resources && !releaseOpening) {
				resources.acquireContract(data);
				releaseOpening = resources.beginOpen(id);
			}
			if (!state) return;
			getContractSnapshotCache().updateState(id, state);
			ready = {
				...data,
				contract: {
					...data.contract,
					...state,
					lastOperationId: state.lastOperationId ?? undefined
				}
			};
			recordColdStart('contract-data-ready');
		});
	});
	const failed = $derived(
		!ready &&
			(Boolean(metadata.error) ||
				snapshot?.status === 'error' ||
				snapshot?.status === 'missing' ||
				metadata.data === null)
	);
	$effect(() => {
		if (failed && !notifiedFailure) {
			notifiedFailure = true;
			untrack(failure);
		}
	});
	async function retry() {
		notifiedFailure = false;
		snapshot = undefined;
		mounted = false;
		await tick();
		attempt++;
		mounted = true;
	}
	function visible() {
		releaseOpening?.();
		releaseOpening = undefined;
		onVisible?.();
	}
	function failure() {
		releaseOpening?.();
		releaseOpening = undefined;
		onFailure?.();
	}
</script>

{#if ready}
	<RepWorkspace
		snapshot={ready.snapshot}
		initialContract={ready.contract}
		{metadata}
		onVisible={visible}
		onFailure={failure}
	/>
{:else}
	<AppHeader />
	{#if failed}
		<main class="mx-auto max-w-2xl px-6 py-12 text-center">
			{#if metadata.data === null || snapshot?.status === 'missing'}
				<h1 class="text-xl font-medium">Contract not found</h1>
				<p class="mt-3 text-ink-muted">This contract may have been deleted.</p>
			{:else}
				<p role="alert">We couldn’t load this contract.</p>
				<button class="mt-4 rounded-button-sm border border-line bg-surface px-4 py-2" onclick={retry}
					>Try again</button
				>
			{/if}
			<a href="/" class="mt-6 block underline">Back to Home</a>
		</main>
	{:else}<LoadingPagination label="Loading contract" />{/if}
{/if}
