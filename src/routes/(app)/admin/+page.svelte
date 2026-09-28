<script lang="ts">
	import { onMount } from 'svelte';
	import ContractApp from '$lib/components/document/ContractApp.svelte';
	import { AdminPersistence } from '$lib/admin/persistence.svelte';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
	const adminEdits = new AdminPersistence();
	onMount(() => {
		const flush = () => {
			if (document.visibilityState === 'hidden') adminEdits.flushPending();
		};
		const beforeUnload = (event: BeforeUnloadEvent) => {
			adminEdits.flushPending();
			if (!adminEdits.hasUnsavedChanges) return;
			event.preventDefault();
		};
		const retryUncertainDeletes = () => adminEdits.retryUncertainDeletes();
		document.addEventListener('visibilitychange', flush);
		window.addEventListener('online', retryUncertainDeletes);
		window.addEventListener('beforeunload', beforeUnload);
		return () => {
			document.removeEventListener('visibilitychange', flush);
			window.removeEventListener('online', retryUncertainDeletes);
			window.removeEventListener('beforeunload', beforeUnload);
			adminEdits.flushPending();
		};
	});
</script>

<svelte:head>
	<title>Admin view | Agreed</title>
	<meta name="description" content="Review the Oceans XYZ contract in the admin view." />
</svelte:head>

{#if data.blocks.error || data.boxes.error}
	<p role="alert">We couldn’t load this contract. Please refresh to try again.</p>
{:else if data.blocks.data && data.boxes.data}
	<ContractApp
		blocks={data.blocks.data}
		boxes={data.boxes.data}
		adminEdits={data.convexConfigured ? adminEdits : undefined}
		guideVariant="admin"
	/>
{:else}
	<p role="status">Loading contract…</p>
{/if}
