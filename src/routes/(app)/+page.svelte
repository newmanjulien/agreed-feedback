<script lang="ts">
	import { env } from '$env/dynamic/public';
	import { useConvexClient, usePaginatedQuery } from 'convex-svelte';
	import { api } from '../../convex/_generated/api';
	import AppHeader from '$lib/components/chrome/AppHeader.svelte';
	import ContractCard from '$lib/components/contracts/ContractCard.svelte';
	import CompanyNameDialog from '$lib/components/ui/modal/CompanyNameDialog.svelte';
	import type { Id } from '../../convex/_generated/dataModel';
	import { saveError } from '$lib/contract/saved';
	import MagnifyingGlassIcon from 'phosphor-svelte/lib/MagnifyingGlassIcon';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import { setInteractionOwner } from '$lib/components/ui/interactions';
	setInteractionOwner(Symbol('home'));
	const client = env.PUBLIC_CONVEX_URL ? useConvexClient() : null;
	let search = $state('');
	let query = $state('');
	let renaming = $state<{ id: Id<'savedContracts'>; companyName: string } | null>(null);
	let renameError = $state<string | null>(null);
	let actionError = $state<string | null>(null);
	let busy = $state(false);
	let deleting = $state<Id<'savedContracts'> | null>(null);
	const contracts = client
		? usePaginatedQuery(api.savedContracts.browse, () => ({ search: query }), {
				initialNumItems: 24
			})
		: null;
	$effect(() => {
		const value = search.trim();
		const timer = setTimeout(() => (query = value), 200);
		return () => clearTimeout(timer);
	});
	const pendingSearch = $derived(search.trim() !== query);
	async function rename(name: string) {
		if (!client || !renaming || busy) return;
		busy = true;
		renameError = null;
		try {
			await client.mutation(api.savedContracts.rename, { id: renaming.id, companyName: name });
			renaming = null;
		} catch (error) {
			renameError = saveError(error, 'We couldn’t rename this contract. Try again.');
		} finally {
			busy = false;
		}
	}
	async function remove(id: Id<'savedContracts'>, name: string) {
		if (!client || deleting) return;
		if (
			!window.confirm(
				`Delete the contract for “${name}”? This permanently removes its saved choices and document snapshot.`
			)
		)
			return;
		deleting = id;
		actionError = null;
		try {
			await client.mutation(api.savedContracts.remove, { id });
		} catch (error) {
			actionError = saveError(error, 'We couldn’t delete this contract. Try again.');
		} finally {
			deleting = null;
		}
	}
</script>

<svelte:head
	><title>Home | Agreed</title><meta
		name="description"
		content="Find, save, and negotiate your contracts."
	/></svelte:head
>
<AppHeader />
<main
	class="home min-h-[calc(100dvh-var(--app-header-height))] bg-[#fafafa] px-4 py-7 sm:px-6 md:px-8 md:py-8"
>
	<div class="mx-auto max-w-[1800px]">
		<div class="mb-8 flex items-center gap-3">
			<label
				class="flex h-11 min-w-0 flex-1 items-center gap-3 rounded-lg border border-[#e5e5e5] bg-white px-3 text-[#8a8a8a] focus-within:border-ink"
			>
				<MagnifyingGlassIcon size={20} aria-hidden="true" />
				<input
					type="search"
					aria-label="Search contracts"
					placeholder="Search contracts"
					maxlength="200"
					bind:value={search}
					class="min-w-0 flex-1 border-0 bg-transparent text-sm text-ink outline-none placeholder:text-[#8a8a8a] sm:text-[15px]"
				/>
			</label>
			<a
				href="/contracts/new"
				class="flex h-11 shrink-0 items-center gap-2 rounded-lg bg-[#171717] px-4 text-sm font-medium text-white hover:bg-[#303030] sm:px-5"
				><PlusIcon size={17} aria-hidden="true" />Add New</a
			>
		</div>
		<h1 class="mb-5 text-base font-medium">Contracts</h1>
		{#if actionError}<p
				class="mb-5 rounded-lg border border-danger/20 bg-danger-surface p-4 text-sm text-danger"
				role="alert"
			>
				{actionError}
			</p>{/if}
		{#if !contracts || contracts.error}
			<div class="state" role="alert">
				<p>We couldn’t load your contracts.</p>
				<button
					onclick={() => window.location.reload()}
					class="mt-4 rounded-md border border-line bg-surface px-4 py-2 text-sm">Try again</button
				>
			</div>
		{:else if pendingSearch || contracts.status === 'LoadingFirstPage'}
			<div class="cards" aria-label="Loading contracts" aria-busy="true">
				{#each Array(8) as _}<div
						class="h-[160px] animate-pulse rounded-lg border border-[#e5e5e5] bg-white p-6 motion-reduce:animate-none"
					>
						<div class="h-4 w-2/3 rounded bg-[#f0f0f0]"></div>
						<div class="mt-16 h-3 w-1/2 rounded bg-[#f0f0f0]"></div>
					</div>{/each}
			</div>
			<p class="sr-only" role="status">Loading contracts…</p>
		{:else if contracts.results.length === 0 && contracts.status === 'Exhausted'}
			<div class="state" role="status">
				{#if query}<h2 class="font-medium">No contracts found</h2>
					<p class="mt-2 text-sm text-ink-muted">No company names match “{query}”.</p>
					<button onclick={() => (search = '')} class="mt-4 text-sm underline">Clear search</button>
				{:else}<h2 class="font-medium">No saved contracts yet</h2>
					<p class="mt-2 text-sm text-ink-muted">
						Select Add New to start your first contract.
					</p>{/if}
			</div>
		{:else}
			<div class="cards">
				{#each contracts.results as contract (contract._id)}
					<ContractCard
						{contract}
						deleting={deleting === contract._id}
						onRename={() => {
							renaming = { id: contract._id, companyName: contract.companyName };
							renameError = null;
						}}
						onDelete={() => void remove(contract._id, contract.companyName)}
					/>
				{/each}
			</div>
			{#if contracts.status !== 'Exhausted'}<div class="mt-7 flex justify-center">
					<button
						disabled={contracts.status === 'LoadingMore'}
						onclick={() => contracts.loadMore(24)}
						class="rounded-lg border border-[#e5e5e5] bg-white px-5 py-2.5 text-sm disabled:opacity-50"
						>{contracts.status === 'LoadingMore' ? 'Loading…' : 'Load more'}</button
					>
				</div>{/if}
		{/if}
	</div>
</main>
{#if renaming}<CompanyNameDialog
		title="Rename contract"
		initialName={renaming.companyName}
		submitLabel="Rename"
		{busy}
		error={renameError}
		onSubmit={(name) => void rename(name)}
		onClose={() => (renaming = null)}
	/>{/if}

<style>
	.cards {
		display: grid;
		grid-template-columns: 1fr;
		gap: 20px;
	}
	.state {
		border: 1px solid #e5e5e5;
		border-radius: 8px;
		background: white;
		padding: 48px 24px;
		text-align: center;
	}
	@media (min-width: 600px) {
		.cards {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (min-width: 1000px) {
		.cards {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}
	@media (min-width: 1440px) {
		.cards {
			grid-template-columns: repeat(4, minmax(0, 1fr));
			gap: 24px;
		}
	}
</style>
