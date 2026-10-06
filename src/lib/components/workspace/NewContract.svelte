<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { beforeNavigate, goto } from '$app/navigation';
	import { useConvexClient } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import type { Id } from '../../../convex/_generated/dataModel';
	import { saveError } from '$lib/contract/saved';
	import AppHeader from '$lib/components/chrome/AppHeader.svelte';
	import CompanyNameDialog from '$lib/components/ui/modal/CompanyNameDialog.svelte';
	import { getAdminQueries } from '$lib/contract/admin-queries.svelte';
	import ContractPreview from './ContractPreview.svelte';
	let {
		onOpen,
		showPreview = true
	}: { onOpen: (id: Id<'savedContracts'>) => Promise<boolean>; showPreview?: boolean } = $props();
	const client = useConvexClient();
	const shared = getAdminQueries();
	const preview = $derived(
		shared.blocks.data && shared.items.data && !shared.blocks.error && !shared.items.error
			? { blocks: shared.blocks.data, items: shared.items.data }
			: undefined
	);
	let busy = $state(false);
	let error = $state<string | null>(null);
	let createdId = $state<Id<'savedContracts'> | null>(null);
	let deleted = $state(false);
	let operationId: string;
	let active = true;
	onDestroy(() => {
		active = false;
	});
	onMount(() => {
		operationId = crypto.randomUUID();
	});
	beforeNavigate((navigation) => {
		if (busy && navigation.to?.url.pathname !== `/contracts/${createdId}`) navigation.cancel();
	});
	async function submit(companyName: string) {
		if (busy || deleted) return;
		busy = true;
		error = null;
		try {
			if (!createdId) {
				const result = await client.mutation(api.savedContracts.create, {
					companyName,
					operationId
				});
				if (result.status === 'deleted') {
					deleted = true;
					throw new Error('deleted');
				}
				createdId = result.id;
			}
			if (!(await onOpen(createdId))) throw new Error('navigation');
		} catch (cause) {
			if (active)
				error = deleted
					? 'This contract was deleted. Return to Home to start another contract.'
					: createdId
						? 'Your contract was created, but we couldn’t open it. Try again.'
						: saveError(cause, 'We couldn’t create this contract. Try again.');
		} finally {
			if (active) busy = false;
		}
	}
	async function cancel() {
		if (busy) return;
		try {
			await goto('/');
		} catch {
			error = 'We couldn’t return to Home. Try again.';
		}
	}
</script>

{#if showPreview}<AppHeader />
	<main inert aria-hidden="true" class="pointer-events-none pt-6 pb-12 blur-sm">
		{#if preview}
			<ContractPreview snapshot={preview} />
		{:else}
			<div
				class="mx-auto min-h-[1000px] w-[min(816px,calc(100%-32px))] border border-line bg-white p-12 shadow-sm"
			>
				<div class="mx-auto mb-12 h-5 w-2/3 rounded bg-fill-subtle"></div>
				{#each Array(36) as _, i}
					<div
						class="mb-3 h-2.5 rounded bg-fill-subtle"
						style:width={i % 7 === 6 ? '65%' : '100%'}
					></div>
				{/each}
			</div>
		{/if}
	</main>{/if}
<CompanyNameDialog
	title="Name your contract"
	submitLabel={deleted ? 'Back to Home' : createdId ? 'Open contract' : 'Create contract'}
	busyLabel={createdId ? 'Opening…' : 'Creating…'}
	lockName={Boolean(createdId) || deleted}
	{busy}
	{error}
	onSubmit={(name) => void (deleted ? cancel() : submit(name))}
	onClose={() => void cancel()}
/>
