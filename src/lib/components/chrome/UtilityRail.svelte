<script lang="ts">
	import InfoIcon from 'phosphor-svelte/lib/InfoIcon';
	import MagnifyingGlassIcon from 'phosphor-svelte/lib/MagnifyingGlassIcon';
	import SquareIconButton from '$lib/components/ui/SquareIconButton.svelte';

	let {
		searchOpen,
		searchElement = $bindable(),
		onSearchToggle,
		onOpenGuide
	}: {
		searchOpen: boolean;
		searchElement?: HTMLButtonElement;
		onSearchToggle: (trigger: HTMLButtonElement) => void;
		onOpenGuide: () => void;
	} = $props();
	const itemClass = 'flex flex-col items-center gap-1 text-[11px] leading-[1.2] text-ink-secondary';
</script>

<nav class="pointer-events-auto flex w-16 flex-col items-center" aria-label="Document tools">
	<div class="flex flex-col items-center gap-[18px]">
		<div class={itemClass}>
			<SquareIconButton
				bind:element={searchElement}
				type="button"
				aria-label="Search"
				aria-pressed={searchOpen}
				aria-controls="document-search"
				data-utility-trigger="search"
				onclick={() => searchElement && onSearchToggle(searchElement)}
			>
				<MagnifyingGlassIcon aria-hidden="true" size={22} weight="regular" />
			</SquareIconButton>
			<span aria-hidden="true">Search</span>
		</div>
		<div class={itemClass}>
			<SquareIconButton type="button" aria-label="How Agreed works" onclick={onOpenGuide}>
				<InfoIcon aria-hidden="true" size={22} weight="regular" />
			</SquareIconButton>
			<span aria-hidden="true">Guide</span>
		</div>
	</div>
</nav>
