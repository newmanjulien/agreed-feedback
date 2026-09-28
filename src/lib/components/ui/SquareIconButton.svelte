<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	type Props = Omit<HTMLButtonAttributes, 'class'> & {
		children: Snippet;
		element?: HTMLButtonElement;
		size?: 'sm' | 'md';
	};

	let { children, element = $bindable(), size = 'md', ...buttonAttributes }: Props = $props();
</script>

<button
	bind:this={element}
	{...buttonAttributes}
	class={`grid ${size === 'sm' ? 'size-7' : 'size-9'} cursor-pointer place-items-center rounded-sm border border-transparent bg-transparent p-0 text-ink-secondary shadow-none hover:bg-hover focus-visible:bg-hover focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent aria-expanded:bg-hover aria-pressed:bg-accent aria-pressed:text-surface aria-pressed:hover:bg-accent-hover aria-pressed:focus-visible:bg-accent-hover disabled:cursor-default disabled:opacity-[0.36] disabled:hover:bg-transparent [&_svg]:pointer-events-none`}
>
	{@render children()}
</button>
