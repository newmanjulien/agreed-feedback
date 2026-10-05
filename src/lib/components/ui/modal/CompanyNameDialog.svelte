<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { getInteractionController } from '$lib/components/ui/interactions';
	let {
		title,
		initialName = '',
		submitLabel = 'Save contract',
		busy = false,
		error = null,
		onSubmit,
		onClose
	}: {
		title: string;
		initialName?: string;
		submitLabel?: string;
		busy?: boolean;
		error?: string | null;
		onSubmit: (name: string) => void;
		onClose: () => void;
	} = $props();
	const interactions = getInteractionController();
	const titleId = $props.id();
	let name = $state(untrack(() => initialName));
	let validation = $state<string | null>(null);
	let dialog: HTMLDialogElement;
	let input: HTMLInputElement;
	onMount(() => {
		interactions.closeTransient();
		dialog.showModal();
		input.focus();
		input.select();
	});
	function submit(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		if (!name.trim()) {
			validation = 'Enter a buyer company name.';
			input.focus();
			return;
		}
		validation = null;
		onSubmit(name.trim());
	}
</script>

<dialog
	bind:this={dialog}
	aria-labelledby={titleId}
	oncancel={(event) => {
		event.preventDefault();
		if (!busy) onClose();
	}}
	class="m-auto w-[calc(100%-32px)] max-w-[420px] rounded-xl border border-line bg-surface p-6 text-ink shadow-xl backdrop:bg-black/25"
>
	<form onsubmit={submit}>
		<h2 id={titleId} class="mb-5 text-lg font-medium">{title}</h2>
		<label class="mb-2 block text-sm" for={`${titleId}-name`}>Buyer company name</label>
		<input
			bind:this={input}
			id={`${titleId}-name`}
			bind:value={name}
			oninput={() => (validation = null)}
			disabled={busy}
			maxlength="200"
			autocomplete="organization"
			aria-invalid={Boolean(validation || error)}
			aria-describedby={validation || error ? `${titleId}-error` : undefined}
			class="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-ink"
		/>
		{#if validation || error}<p
				id={`${titleId}-error`}
				role="alert"
				class="mt-3 text-sm text-danger"
			>
				{validation || error}
			</p>{/if}
		<div class="mt-6 flex justify-end gap-2">
			<button
				type="button"
				disabled={busy}
				onclick={onClose}
				class="rounded-md border border-line px-4 py-2 text-sm disabled:opacity-50">Cancel</button
			>
			<button
				type="submit"
				disabled={busy}
				class="rounded-md bg-[#171717] px-4 py-2 text-sm text-white disabled:opacity-50"
				>{busy ? 'Saving…' : submitLabel}</button
			>
		</div>
	</form>
</dialog>
