<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { getInteractionController } from '$lib/components/ui/interactions';
	let {
		title,
		initialName = '',
		submitLabel = 'Save contract',
		busyLabel = 'Saving…',
		lockName = false,
		busy = false,
		error = null,
		onSubmit,
		onClose
	}: {
		title: string;
		initialName?: string;
		submitLabel?: string;
		busyLabel?: string;
		lockName?: boolean;
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
		<h2 id={titleId} class="mb-5 text-[17px] font-medium">{title}</h2>
		<label class="mb-2 block text-sm" for={`${titleId}-name`}>Buyer company name</label>
		<input
			bind:this={input}
			id={`${titleId}-name`}
			bind:value={name}
			oninput={() => (validation = null)}
			disabled={busy || lockName}
			maxlength="200"
			autocomplete="organization"
			aria-invalid={Boolean(validation || error)}
			aria-describedby={validation || error ? `${titleId}-error` : undefined}
			class="h-9 w-full rounded-xl border border-[#e5e5e5] bg-white px-3 text-[13px] text-ink outline-none transition-colors placeholder:text-[#8a8a8a] focus:border-[#d5d5d5] disabled:opacity-50"
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
				class="h-9 rounded-button-lg border border-[#e5e5e5] bg-white px-3 text-[13px] font-normal transition-colors hover:bg-[#f3f3f3] focus-visible:outline-1 focus-visible:outline-[#d5d5d5] disabled:opacity-50">Cancel</button
			>
			<button
				type="submit"
				disabled={busy}
				class="h-9 rounded-button-lg bg-[#171717] px-3 text-[13px] font-normal text-white hover:bg-[#303030] focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[#d5d5d5] disabled:opacity-50"
				>{busy ? busyLabel : submitLabel}</button
			>
		</div>
	</form>
</dialog>
