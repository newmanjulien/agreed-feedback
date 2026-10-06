<script lang="ts">
	import { untrack, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import type { Id } from '../../../convex/_generated/dataModel';
	import type { ContractRouteData } from '$lib/contract/saved';
	import SavedContract from './SavedContract.svelte';
	import NewContract from './NewContract.svelte';
	let { data }: { data: ContractRouteData } = $props();
	let creating = $state(untrack(() => data.status === 'new'));
	let creationTarget = $state<string | null>(null);
	let attempt = $state(0);
	let completion: ((success: boolean) => void) | undefined;
	$effect(() => {
		const next = data;
		untrack(() => {
			if (creating && next.id === creationTarget) return;
			creating = next.status === 'new';
			creationTarget = null;
		});
	});
	onDestroy(() => completion?.(false));
	async function openSaved(id: Id<'savedContracts'>) {
		creationTarget = id;
		try {
			if (data.id !== id)
				await goto(`/contracts/${id}`, { replaceState: true, noScroll: true, keepFocus: true });
			if (data.id !== id) return false;
			return await new Promise<boolean>((resolve) => {
				completion = resolve;
				attempt++;
			});
		} catch {
			return false;
		}
	}
	function visible() {
		if (!creating) return;
		completion?.(true);
		completion = undefined;
		creating = false;
		creationTarget = null;
	}
	function failure() {
		completion?.(false);
		completion = undefined;
	}
</script>

{#if data.id && (!creating || (creationTarget && attempt > 0))}
	{#key `${data.id}:${attempt}`}
		<SavedContract id={data.id} onVisible={visible} onFailure={failure} />
	{/key}
{/if}
{#if creating}<NewContract onOpen={openSaved} showPreview={!creationTarget} />{/if}
