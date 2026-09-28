<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		text,
		label = text,
		children
	}: {
		text: string;
		label?: string;
		children: Snippet;
	} = $props();

	const componentId = $props.id();
	const tooltipId = `${componentId}-tooltip`;
</script>

<span class="group/tooltip relative inline-flex">
	<button
		type="button"
		class="inline-flex cursor-help items-center justify-center rounded-sm border-0 bg-transparent p-0 text-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
		aria-label={label}
		aria-describedby={tooltipId}
	>
		{@render children()}
	</button>
	<span
		id={tooltipId}
		role="tooltip"
		class="pointer-events-none invisible absolute top-[calc(100%+8px)] right-0 z-50 w-max max-w-[min(18rem,calc(100vw-1.5rem))] rounded-control bg-ink-secondary px-2.5 py-2 text-left text-xs leading-[1.4] text-surface opacity-0 transition-opacity group-hover/tooltip:visible group-hover/tooltip:opacity-100 group-focus-within/tooltip:visible group-focus-within/tooltip:opacity-100 motion-reduce:transition-none"
	>
		{text}
	</span>
</span>
