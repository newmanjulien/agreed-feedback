<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import XIcon from 'phosphor-svelte/lib/XIcon';
	import SquareIconButton from '$lib/components/ui/SquareIconButton.svelte';
	import { getInteractionController } from '$lib/components/ui/interactions';
	const interactions = getInteractionController();

	let {
		title,
		onClose,
		children
	}: {
		title: string;
		onClose: () => void;
		children?: Snippet;
	} = $props();

	let dialogElement = $state<HTMLDialogElement>();
	const titleId = $props.id();

	onMount(() => {
		if (!dialogElement) throw new Error('Modal dialog failed to mount.');
		interactions.closeTransient();
		dialogElement.showModal();
		dialogElement.focus({ preventScroll: true });
	});

	function closeModal() {
		if (dialogElement?.open) dialogElement.close();
		onClose();
	}

	function handleCancel(event: Event) {
		event.preventDefault();
		closeModal();
	}

	function handleBackdropClick(event: MouseEvent) {
		if (event.target === dialogElement) closeModal();
	}
</script>

<dialog
	bind:this={dialogElement}
	class="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none overflow-hidden border-0 bg-transparent p-4 text-ink outline-none backdrop:bg-canvas/70 max-[600px]:p-0"
	aria-labelledby={titleId}
	tabindex="-1"
	oncancel={handleCancel}
	onclick={handleBackdropClick}
>
	<div
		class="relative mx-auto flex h-full min-h-0 w-full max-w-[480px] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-none max-[600px]:rounded-none max-[600px]:border-0"
	>
		<div
			class="absolute top-4 right-4 z-10 [&_button:hover]:bg-fill-subtle [&_button:focus-visible]:bg-fill-subtle"
		>
			<SquareIconButton type="button" aria-label="Close modal" onclick={closeModal}>
				<XIcon aria-hidden="true" size={22} weight="regular" />
			</SquareIconButton>
		</div>

		<header class="min-w-0 px-4 py-4 pr-14">
			<h2 id={titleId} class="text-lg leading-tight font-medium text-ink">{title}</h2>
		</header>

		{#if children}
			<div class="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
				{@render children()}
			</div>
		{/if}
	</div>
</dialog>
