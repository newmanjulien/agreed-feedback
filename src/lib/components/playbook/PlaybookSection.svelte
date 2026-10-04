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
		class={`flex w-full items-center gap-1.5 rounded-xl text-[15px] leading-[1.3] ${danger ? 'bg-danger-surface text-danger hover:bg-danger-surface-hover' : 'bg-canvas text-ink hover:bg-fill-subtle'}`}
	>
		<button
			class="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-xl border-0 bg-transparent px-3 py-2.5 text-left focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
			type="button"
			aria-labelledby={`${id}-label`}
			aria-expanded={open === value}
			aria-controls={`${id}-body`}
			onclick={() => (open = open === value ? null : value)}
		>
			<span id={`${id}-label`}>{label}</span>
			<CaretDownIcon
				aria-hidden="true"
				size={14}
				weight="bold"
				class={`ml-auto shrink-0 ${danger ? 'text-danger/30' : 'text-ink-muted/25'}`}
			/>
		</button>
		{#if important}<span class="mr-3 inline-flex">
				<Tooltip text="It’s important to negotiate this clause">
					<InfoIcon aria-hidden="true" size={18} weight="regular" class="text-accent" />
				</Tooltip>
			</span>{/if}
	</div>
	<div
		id={`${id}-body`}
		class="mt-2 mb-1 flex flex-col gap-3 px-1 text-[15px] leading-[1.45] text-ink-muted/85"
		hidden={open !== value}
	>
		{@render children()}
	</div>
</div>
