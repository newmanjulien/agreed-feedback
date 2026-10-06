<script lang="ts">
	import { env } from '$env/dynamic/public';
	import { onDestroy, onMount, untrack } from 'svelte';
	import { readCachedCards, storeCards, type CachedCard } from '$lib/contract/browser-storage';
	import { createVisibleContractWarming } from '$lib/contract/visible-contracts.svelte';
	import { getContractSnapshotCache } from '$lib/contract/snapshot-cache';
	import { useConvexClient, usePaginatedQuery } from 'convex-svelte';
	import { api } from '../../convex/_generated/api';
	import AppHeader from '$lib/components/chrome/AppHeader.svelte';
	import ContractCard from '$lib/components/contracts/ContractCard.svelte';
	import CompanyNameDialog from '$lib/components/ui/modal/CompanyNameDialog.svelte';
	import type { Id } from '../../convex/_generated/dataModel';
	import { saveError } from '$lib/contract/saved';
	import MagnifyingGlassIcon from 'phosphor-svelte/lib/MagnifyingGlassIcon';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import XIcon from 'phosphor-svelte/lib/XIcon';
	import { setInteractionOwner } from '$lib/components/ui/interactions';
	setInteractionOwner(Symbol('home'));
	const client = env.PUBLIC_CONVEX_URL ? useConvexClient() : null;
	const warming = createVisibleContractWarming();
	onDestroy(() => warming.destroy());
	let search = $state('');
	let searchInput = $state<HTMLInputElement>();
	let query = $state('');
	let renaming = $state<{ id: Id<'savedContracts'>; companyName: string } | null>(null);
	let renameError = $state<string | null>(null);
	let actionError = $state<string | null>(null);
	let busy = $state(false);
	let deleting = $state<Id<'savedContracts'> | null>(null);
	const contracts = client
		? usePaginatedQuery(api.savedContracts.browse, () => ({ search: query }), {
				initialNumItems: 24,
				keepPreviousData: true
			})
		: null;
	$effect(() => {
		const value = search.trim();
		const timer = setTimeout(() => (query = value), 200);
		return () => clearTimeout(timer);
	});
	const pendingSearch = $derived(search.trim() !== query);
	let retained = $state.raw<CachedCard[]>([]);
	let settledQuery = $state<string | null>(null);
	onMount(() => {
		if (settledQuery === null) retained = readCachedCards();
	});
	const waiting = $derived(
		pendingSearch ||
			Boolean(
				contracts &&
				!contracts.error &&
				((contracts.isLoading && contracts.status !== 'LoadingMore') || settledQuery !== query)
			)
	);
	const cards = $derived(retained);
	$effect(() => {
		if (
			!contracts ||
			(contracts.isLoading && contracts.status !== 'LoadingMore') ||
			contracts.error
		)
			return;
		const results = contracts.results;
		const currentQuery = query;
		untrack(() => {
			retained = results.filter((card) => !getContractSnapshotCache().isDeleted(card._id));
			settledQuery = currentQuery;
			if (!currentQuery) storeCards(retained);
		});
	});
	$effect(() => {
		const pending = waiting;
		untrack(() => warming.pending(pending));
	});
	async function rename(name: string) {
		if (!client || !renaming || busy) return;
		busy = true;
		renameError = null;
		try {
			await client.mutation(api.savedContracts.rename, { id: renaming.id, companyName: name });
			getContractSnapshotCache().rename(renaming.id, name);
			retained = retained.map((card) =>
				card._id === renaming!.id ? { ...card, companyName: name, savedAt: Date.now() } : card
			);
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
			getContractSnapshotCache().remove(id);
			retained = retained.filter((card) => card._id !== id);
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
	class="home min-h-[calc(100dvh-var(--app-header-height))] bg-[#fafafa] px-3 py-4 sm:px-4 md:px-5 md:py-5"
>
	<div class="mx-auto max-w-[1800px]">
		<div class="mb-6 flex items-center gap-2">
			<div
				class="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-xl border border-[#e5e5e5] bg-white px-3 text-[#8a8a8a] transition-colors focus-within:border-[#d5d5d5]"
			>
				<MagnifyingGlassIcon size={17} aria-hidden="true" />
				<input
					bind:this={searchInput}
					type="search"
					aria-label="Search contracts"
					placeholder="Search by name of company"
					maxlength="200"
					bind:value={search}
					class="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-ink outline-none placeholder:text-[#8a8a8a] [&::-webkit-search-cancel-button]:hidden"
				/>
				{#if search}
					<button
						type="button"
						aria-label="Clear search"
						class="-mr-1 flex size-6 shrink-0 items-center justify-center rounded-md text-[#8a8a8a] transition-colors hover:bg-[#f3f3f3] hover:text-ink focus-visible:outline-1 focus-visible:outline-[#d5d5d5]"
						onclick={() => {
							search = '';
							searchInput?.focus();
						}}
					>
						<XIcon size={14} weight="regular" aria-hidden="true" />
					</button>
				{/if}
			</div>
			<a
				href="/contracts/new"
				class="flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-[#171717] px-3 text-[13px] font-normal text-white hover:bg-[#303030]"
				><PlusIcon size={15} aria-hidden="true" />Add New</a
			>
		</div>
		<div class="mb-3 flex items-center gap-3">
			<h1 class="text-sm font-medium">Contracts</h1>
			{#if waiting}<span role="status" class="text-xs text-ink-muted">Loading…</span>{/if}
		</div>
		{#if contracts?.error && cards.length}<p class="mb-3 text-xs text-ink-muted" role="status">
				We couldn’t refresh your contracts. Showing previous results.
			</p>{/if}
		{#if actionError}<p
				class="mb-5 rounded-xl border border-danger/20 bg-danger-surface p-4 text-sm text-danger"
				role="alert"
			>
				{actionError}
			</p>{/if}
		{#if (!contracts || contracts.error) && cards.length === 0}
			<div class="state" role="alert">
				<p>We couldn’t load your contracts.</p>
				<button
					onclick={() => window.location.reload()}
					class="mt-4 rounded-xl border border-line bg-surface px-4 py-2 text-sm">Try again</button
				>
			</div>
		{:else if waiting && cards.length === 0}
			<div class="cards" aria-label="Loading contracts" aria-busy="true">
				{#each Array(8) as _}<div
						aria-hidden="true"
						class="flex min-h-[98px] flex-col justify-between gap-1.5 animate-pulse rounded-xl border border-[#e5e5e5] bg-white p-3 pr-10 motion-reduce:animate-none"
					>
						<div class="h-5 w-2/3 rounded bg-[#f0f0f0]"></div>
						<div class="flex items-center gap-2">
							<div class="size-5 shrink-0 rounded-full bg-[#f0f0f0]"></div>
							<div class="h-3 w-1/2 rounded bg-[#f0f0f0]"></div>
						</div>
						<div class="h-4 w-2/3 rounded bg-[#f0f0f0]"></div>
					</div>{/each}
			</div>
			<p class="sr-only" role="status">Loading contracts…</p>
		{:else if cards.length === 0 && !waiting}
			<div class="state" role="status">
				{#if query}<h2 class="text-[13px] font-medium">No contracts found</h2>
					<p class="mt-2 text-xs text-ink-muted">No company names match “{query}”.</p>
					<button onclick={() => (search = '')} class="mt-4 text-xs underline">Clear search</button>
				{:else}<h2 class="font-medium">No contracts yet</h2>
					<p class="mt-2 text-sm text-ink-muted">
						Select Add New to start your first contract.
					</p>{/if}
			</div>
		{:else}
			<div class="cards">
				{#each cards as contract (contract._id)}
					<ContractCard
						{contract}
						observe={warming.observe}
						onWarm={() => warming.warm(contract._id)}
						onCool={() => warming.cool(contract._id)}
						deleting={deleting === contract._id}
						onRename={() => {
							renaming = { id: contract._id, companyName: contract.companyName };
							renameError = null;
						}}
						onDelete={() => void remove(contract._id, contract.companyName)}
					/>
				{/each}
			</div>
			{#if contracts && contracts.status !== 'Exhausted'}<div class="mt-6 flex justify-center">
					<button
						disabled={waiting ||
							Boolean(contracts.error) ||
							settledQuery !== query ||
							contracts.status === 'LoadingMore'}
						onclick={() => contracts.loadMore(24)}
						class="rounded-xl border border-[#e5e5e5] bg-white px-4 py-2 text-sm disabled:opacity-50"
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
		gap: 12px;
	}
	.state {
		border: 1px solid #e5e5e5;
		border-radius: var(--radius-base);
		background: white;
		padding: 36px 20px;
		font-size: 14px;
		text-align: center;
	}
	@media (min-width: 600px) {
		.cards {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (min-width: 1000px) {
		.cards {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
	}
</style>
