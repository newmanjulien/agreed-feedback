<script lang="ts">
	import type { ActionData, PageData } from './$types';
	let { data, form }: { data: PageData; form: ActionData | null } = $props();
</script>

<svelte:head>
	<title>Enter password | Agreed</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="grid min-h-screen place-items-center bg-canvas p-6 text-ink">
	<form
		class="grid w-full max-w-[380px] gap-4 rounded-base border border-line bg-surface p-[18px]"
		method="POST"
		action="/gate?next={encodeURIComponent(data.next)}"
	>
		<p class="m-0 text-ink-secondary">Enter your password.</p>
		<input
			class="w-full rounded-md border border-line bg-surface p-3 text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
			id="password"
			name="password"
			type="password"
			autocomplete="current-password"
			required
		/>
		{#if form?.incorrect}<p class="m-0 text-danger" role="alert">
				Incorrect password. Try again.
			</p>{/if}
		<button
			class="cursor-pointer rounded-button-md border-0 bg-accent p-2.5 font-normal text-surface hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
			type="submit">Continue</button
		>
	</form>
</main>
