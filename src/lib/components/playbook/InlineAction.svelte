<script lang="ts">
	import type { Snippet } from 'svelte';
	let {
		children,
		danger = false,
		disabled = false,
		label,
		describedBy,
		onclick
	}: {
		children: Snippet;
		danger?: boolean;
		disabled?: boolean;
		label?: string;
		describedBy?: string;
		onclick?: () => void;
	} = $props();
</script>

<button
	type="button"
	{disabled}
	aria-label={label}
	aria-describedby={describedBy}
	class={`border-0 bg-transparent p-0 [font:inherit] whitespace-normal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${disabled ? 'cursor-default opacity-50' : 'cursor-pointer hover:underline'}`}
	class:text-danger={danger}
	class:text-accent={!danger}
	{onclick}>{@render children()}</button
>
