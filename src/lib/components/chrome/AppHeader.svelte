<script lang="ts">
	import { asset } from '$app/paths';
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import { OCEANS_PROFILE } from '$lib/profiles';
	let { actions, children }: { actions?: Snippet; children?: Snippet } = $props();
	const navItems = [
		{ label: 'Home', href: '/' },
		{ label: 'Admin', href: '/admin' }
	];
</script>

<header class="sticky top-0 z-40 h-[var(--app-header-height)] border-b border-line/60 bg-surface">
	<div class="flex h-full w-full items-stretch px-1.5 sm:px-2.5 md:px-4">
		<a
			class="mr-1.5 flex shrink-0 items-center sm:mr-3.5 md:mr-6"
			href="/"
			aria-label="Agreed Home"
		>
			<img src={asset('/logo.png')} alt="" width="68" height="122" class="h-4.5 w-auto md:h-5.5" />
		</a>
		<nav class="flex h-full shrink-0 items-stretch" aria-label="Primary navigation">
			{#each navItems as item (item.href)}
				{@const active =
					item.href === '/admin'
						? page.url.pathname.startsWith('/admin')
						: !page.url.pathname.startsWith('/admin')}
				<a
					class="relative mr-0.5 flex items-center px-1.5 text-[13px] leading-none transition-colors sm:mr-3"
					class:text-ink={active}
					class:text-ink-muted={!active}
					aria-current={active ? 'page' : undefined}
					href={item.href}
				>
					{item.label}
					{#if active}<span class="absolute inset-x-0 bottom-0 h-0.5 bg-ink" aria-hidden="true"
						></span>{/if}
				</a>
			{/each}
		</nav>
		<div class="my-auto ml-auto flex min-w-0 items-center gap-1.5 sm:gap-3">
			{#if actions}{@render actions()}{/if}
			<Avatar name={OCEANS_PROFILE.name} avatarUrl={OCEANS_PROFILE.avatarUrl} size={26} />
		</div>
	</div>
	{#if children}{@render children()}{/if}
</header>
