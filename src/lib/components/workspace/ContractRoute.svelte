<script lang="ts">
	import { untrack } from 'svelte';
	import { goto, invalidate } from '$app/navigation';
	import type { Id } from '../../../convex/_generated/dataModel';
	import { CONTRACT_SNAPSHOT_DEPENDENCY, type ContractRouteData } from '$lib/contract/saved';
	import AppHeader from '$lib/components/chrome/AppHeader.svelte';
	import RepWorkspace from './RepWorkspace.svelte';
	let { data }: { data: ContractRouteData } = $props();
	let captured = $state.raw(untrack(() => data));
	let workspaceId = $state(untrack(() => data.id));
	let retrying = $state(false);

	$effect(() => {
		const next = data;
		untrack(() => {
			// Accepted snapshots belong to the editing session, including its first saved URL.
			if (next.id === workspaceId && captured.status === 'ready') return;
			workspaceId = next.id;
			captured = next;
		});
	});

	async function retry() {
		if (retrying) return;
		retrying = true;
		try {
			await invalidate(CONTRACT_SNAPSHOT_DEPENDENCY);
		} catch {
			// Keep the error state if the route request itself fails.
		} finally {
			retrying = false;
		}
	}

	async function openSaved(contractId: Id<'savedContracts'>) {
		if (data.id === contractId) return true;
		const previousId = data.id;
		// Adopt the saved identity before navigation so incoming data cannot replace local edits.
		workspaceId = contractId;
		try {
			await goto(`/contracts/${contractId}`, {
				replaceState: true,
				noScroll: true,
				keepFocus: true
			});
			return data.id === contractId;
		} finally {
			if (data.id === previousId) workspaceId = previousId;
		}
	}
</script>

{#if captured.status === 'ready'}{#key captured}<RepWorkspace
			snapshot={captured.snapshot}
			initialContract={captured.contract}
			onSaved={openSaved}
		/>{/key}
{:else}
	<AppHeader />
	<main class="mx-auto max-w-2xl px-6 py-12 text-center">
		{#if retrying}<p role="status">Loading contract…</p>
		{:else if captured.status === 'missing'}<h1 class="text-xl font-medium">Contract not found</h1>
			<p class="mt-3 text-ink-muted">This contract may have been deleted.</p>
		{:else if captured.status === 'error'}<p role="alert">We couldn’t load this contract.</p>
			<button
				class="mt-4 rounded-md border border-line bg-surface px-4 py-2"
				onclick={() => void retry()}>Try again</button
			>{/if}
		<a href="/" class="mt-6 block underline">Back to Home</a>
	</main>
{/if}
