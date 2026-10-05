<script lang="ts">
	import Menu from '$lib/components/ui/Menu.svelte';
	import DotsThreeIcon from 'phosphor-svelte/lib/DotsThreeIcon';
	import type { Id } from '../../../convex/_generated/dataModel';
	let {
		contract,
		deleting = false,
		onRename,
		onDelete
	}: {
		contract: { _id: Id<'savedContracts'>; companyName: string; savedAt: number };
		deleting?: boolean;
		onRename: () => void;
		onDelete: () => void;
	} = $props();
	let open = $state(false);
	let trigger = $state<HTMLButtonElement>();
	const menuId = $props.id();
	const date = $derived(
		new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(
			contract.savedAt
		)
	);
</script>

<article
	class="relative min-w-0 rounded-lg border border-[#e5e5e5] bg-white shadow-[0_1px_2px_rgb(0_0_0/4%)] transition-colors hover:border-[#c5c5c5]"
>
	<a
		href={`/contracts/${contract._id}`}
		class="flex min-h-[160px] flex-col justify-between gap-10 rounded-lg p-5 pr-14 outline-none focus-visible:ring-2 focus-visible:ring-ink"
		aria-label={`Open contract for ${contract.companyName}`}
	>
		<h2
			class="line-clamp-2 break-words text-[15px] leading-6 font-medium"
			title={contract.companyName}
		>
			{contract.companyName}
		</h2>
		<p class="text-[13px] text-ink-muted">
			Last saved <time datetime={new Date(contract.savedAt).toISOString()}>{date}</time>
		</p>
	</a>
	<button
		bind:this={trigger}
		type="button"
		disabled={deleting}
		onclick={() => (open = !open)}
		aria-label={`Options for ${contract.companyName}`}
		aria-haspopup="menu"
		aria-expanded={open}
		aria-controls={open ? menuId : undefined}
		class="absolute top-4 right-3 flex size-8 items-center justify-center rounded-md hover:bg-[#f3f3f3] disabled:opacity-50"
		><DotsThreeIcon size={24} weight="bold" aria-hidden="true" /></button
	>
	<Menu
		{open}
		{trigger}
		id={menuId}
		label={`Contract options for ${contract.companyName}`}
		onClose={() => (open = false)}
	>
		{#snippet children(close)}
			<button
				type="button"
				role="menuitem"
				class="block w-full rounded px-4 py-2 text-left text-sm hover:bg-fill-subtle focus:bg-fill-subtle"
				onclick={() => {
					close();
					onRename();
				}}>Rename</button
			>
			<button
				type="button"
				role="menuitem"
				class="block w-full rounded px-4 py-2 text-left text-sm text-danger hover:bg-danger-surface focus:bg-danger-surface"
				onclick={() => {
					close();
					onDelete();
				}}>Delete</button
			>
		{/snippet}
	</Menu>
</article>
