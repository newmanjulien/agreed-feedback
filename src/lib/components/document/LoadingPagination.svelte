<script lang="ts">
	let { label = 'Laying out contract pages' }: { label?: string } = $props();
</script>

<div
	class="grid min-h-[calc(100vh-100px)] place-items-center"
	data-testid="pagination-loading"
	role="status"
	aria-live="polite"
>
	<span
		class="size-6 animate-spin rounded-full border-2 border-line-strong/50 border-t-ink-muted [animation-duration:700ms] motion-reduce:[animation-duration:1400ms]"
		aria-hidden="true"
	></span>
	<span class="sr-only">{label}</span>
</div>
