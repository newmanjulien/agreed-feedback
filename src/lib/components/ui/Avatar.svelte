<script lang="ts">
	import { assets, base } from '$app/paths';
	import UserIcon from 'phosphor-svelte/lib/UserIcon';

	let {
		name,
		avatarUrl,
		size = 24,
		decorative = false
	}: {
		name: string;
		avatarUrl: string | null;
		size?: number;
		decorative?: boolean;
	} = $props();
	let failedUrl = $state<string | null>(null);
	const url = $derived(avatarUrl?.trim() || null);
	const src = $derived(url?.startsWith('/') ? `${assets || base}${url}` : url);
	const initials = $derived.by(() => {
		const words = name.trim().split(/\s+/).filter(Boolean);
		return [words[0], ...(words.length > 1 ? [words[words.length - 1]] : [])]
			.map((word) => Array.from(word ?? '')[0] ?? '')
			.join('')
			.toUpperCase();
	});
</script>

<span
	role="img"
	aria-label={name}
	aria-hidden={decorative}
	class="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-fill-subtle text-[10px] font-medium text-ink-muted"
	style:width={`${size}px`}
	style:height={`${size}px`}
>
	{#if src && url !== failedUrl}
		<img
			{src}
			alt=""
			width={size}
			height={size}
			class="size-full object-cover"
			onerror={() => (failedUrl = url)}
		/>
	{:else if initials}
		{initials}
	{:else}
		<UserIcon size={size * 0.6} aria-hidden="true" />
	{/if}
</span>
