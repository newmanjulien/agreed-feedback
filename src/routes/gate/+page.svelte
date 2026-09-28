<script lang="ts">
	import type { ActionData, PageData } from './$types';
	let { data, form }: { data: PageData; form: ActionData | null } = $props();
</script>

<svelte:head>
	<title>Enter password | Agreed</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="gate">
	<form method="POST" action="/gate?next={encodeURIComponent(data.next)}">
		<p>Enter your password.</p>
		<input id="password" name="password" type="password" autocomplete="current-password" required />
		{#if form?.incorrect}<p class="error" role="alert">Incorrect password. Try again.</p>{/if}
		<button type="submit">Continue</button>
	</form>
</main>

<style>
	.gate {
		min-height: 100vh;
		display: grid;
		place-items: center;
		padding: 24px;
		background: var(--color-canvas);
		color: var(--color-ink);
	}
	form {
		width: min(100%, 380px);
		display: grid;
		gap: 16px;
		padding: 18px;
		border: 1px solid var(--color-line);
		border-radius: var(--radius-control);
		background: var(--color-surface);
	}
	p {
		margin: 0;
		color: var(--color-ink-secondary);
	}
	input {
		width: 100%;
		padding: 12px;
		border: 1px solid var(--color-line);
		border-radius: var(--radius-sm);
		background: white;
		color: var(--color-ink);
	}
	input:focus-visible,
	button:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
	}
	button {
		padding: 10px;
		border: 0;
		border-radius: var(--radius-lg);
		background: var(--color-accent);
		color: white;
		font-weight: 400;
		cursor: pointer;
	}
	button:hover {
		background: var(--color-accent-hover);
	}
	.error {
		color: var(--color-danger);
	}
</style>
