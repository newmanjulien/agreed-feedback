<script lang="ts">
	import type { Snippet } from 'svelte';
	import CaretDownIcon from 'phosphor-svelte/lib/CaretDownIcon';
	import InfoIcon from 'phosphor-svelte/lib/InfoIcon';
	import Tooltip from '$lib/components/ui/Tooltip.svelte';
	let {
		value,
		label,
		open = $bindable(null),
		danger = false,
		important = false,
		children
	}: {
		value: string;
		label: string;
		open: string | null;
		danger?: boolean;
		important?: boolean;
		children: Snippet;
	} = $props();
	const id = $props.id();
</script>

<div>
	<div
		class={`relative flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-[15px] leading-[1.3] ${danger ? 'bg-danger-surface text-danger hover:bg-danger-surface-hover' : 'bg-canvas text-ink hover:bg-fill-subtle'}`}
	>
		<button
			class="absolute inset-0 cursor-pointer rounded-xl border-0 bg-transparent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
			type="button"
			aria-labelledby={`${id}-label`}
			aria-expanded={open === value}
			aria-controls={`${id}-body`}
			onclick={() => (open = open === value ? null : value)}
		></button>
		<span id={`${id}-label`} class="pointer-events-none relative min-w-0">{label}</span>
		{#if important}<span class="relative inline-flex shrink-0">
				<Tooltip text="It’s important to negotiate this clause">
					<InfoIcon aria-hidden="true" size={18} weight="regular" class="text-accent" />
				</Tooltip>
			</span>{/if}
		<CaretDownIcon
			aria-hidden="true"
			size={14}
			weight="bold"
			class={`pointer-events-none relative ml-auto shrink-0 ${danger ? 'text-danger/30' : 'text-ink-muted/25'}`}
		/>
	</div>
	<div
		id={`${id}-body`}
		class="mt-2 mb-1 flex flex-col gap-3 px-1 text-[15px] leading-[1.45] text-ink-muted/85"
		hidden={open !== value}
	>
		{@render children()}
	</div>
</div>
