<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		title: string;
		panelId: string;
		children: Snippet;
	};

	let { title, panelId, children }: Props = $props();
</script>

<section
	id={panelId}
	class="pointer-events-auto w-full rounded-box border border-line bg-surface p-2.5 text-ink shadow-none"
	aria-label={title}
	data-utility-panel={panelId}
>
	{@render children()}
</section>
