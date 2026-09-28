<script lang="ts">
	import { onMount, tick } from 'svelte';
	import CaretDownIcon from 'phosphor-svelte/lib/CaretDownIcon';
	import CaretUpIcon from 'phosphor-svelte/lib/CaretUpIcon';
	import MagnifyingGlassIcon from 'phosphor-svelte/lib/MagnifyingGlassIcon';
	import type { DocumentSearchSession } from '$lib/document/search/search-session.svelte';
	import UtilityPanelSurface from '$lib/components/chrome/UtilityPanelSurface.svelte';
	import SquareIconButton from '$lib/components/ui/SquareIconButton.svelte';

	let { session }: { session: DocumentSearchSession } = $props();

	let inputElement: HTMLInputElement;

	function handleInput(event: Event) {
		session.setQuery((event.currentTarget as HTMLInputElement).value);
	}

	function handleInputKeydown(event: KeyboardEvent) {
		if (event.key !== 'Enter') return;
		event.preventDefault();
		if (event.shiftKey) session.previous();
		else session.next();
	}

	onMount(() => {
		void tick().then(() => inputElement.focus());
	});
</script>

<UtilityPanelSurface title="Search" panelId="document-search">
	<label
		class="flex items-center gap-2.5 rounded-field border border-line bg-surface px-3 py-2.5 text-ink-secondary transition-colors hover:border-line-strong focus-within:border-accent focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-accent/18 motion-reduce:transition-none"
	>
		<span class="sr-only">Find in document</span>
		<MagnifyingGlassIcon aria-hidden="true" size={20} weight="regular" />
		<input
			class="min-w-0 flex-1 border-0 bg-transparent p-0 text-[15px] leading-[1.45] text-ink outline-none placeholder:text-ink-muted [&::-webkit-search-cancel-button]:hidden"
			bind:this={inputElement}
			data-search-input
			type="search"
			value={session.query}
			placeholder="Find in document"
			autocomplete="off"
			spellcheck="false"
			oninput={handleInput}
			onkeydown={handleInputKeydown}
		/>
	</label>

	{#if !session.supported}
		<p class="mt-3 mb-0 text-sm leading-[1.4]" role="status">
			Search highlighting is unavailable in this browser.
		</p>
	{:else if session.query}
		<div class="mt-3 flex min-h-9 items-center justify-between">
			<p class="m-0 text-sm leading-[1.4]" role="status" aria-live="polite">
				{#if session.resultCount}
					Result {session.activeResultNumber} of {session.resultCount}
				{:else}
					No results
				{/if}
			</p>

			<div class="flex gap-0.5">
				<SquareIconButton
					type="button"
					aria-label="Previous result"
					disabled={!session.resultCount}
					onclick={() => session.previous()}
				>
					<CaretUpIcon aria-hidden="true" size={20} weight="bold" />
				</SquareIconButton>
				<SquareIconButton
					type="button"
					aria-label="Next result"
					disabled={!session.resultCount}
					onclick={() => session.next()}
				>
					<CaretDownIcon aria-hidden="true" size={20} weight="bold" />
				</SquareIconButton>
			</div>
		</div>
	{/if}
</UtilityPanelSurface>
