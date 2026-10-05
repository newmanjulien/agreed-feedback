<script lang="ts">
	import CaretDownIcon from 'phosphor-svelte/lib/CaretDownIcon';
	import Checkbox from '$lib/components/ui/Checkbox.svelte';
	import Popover from '$lib/components/ui/Popover.svelte';
	import type { Concession } from '$lib/playbook/model';
	let {
		concession,
		affectsOtherParts,
		onAffectedPart
	}: {
		concession: Concession;
		affectsOtherParts: boolean;
		onAffectedPart: (value: boolean) => void;
	} = $props();
	const optionsId = $props.id();
	let optionsOpen = $state(false);
	let optionsButton = $state<HTMLButtonElement>();
	let keyboardOpen = $state(false);
	const selectedOptions = $derived(
		[concession.tier === 'rare' && 'Rare concession', affectsOtherParts && 'Affects another part']
			.filter(Boolean)
			.join(', ')
	);
</script>

<div class="flex flex-col gap-3 text-[15px] leading-[1.45] text-ink-muted">
	<textarea
		class="block min-h-28 w-full resize-y rounded-base border border-line bg-surface px-3 py-2 text-ink placeholder:text-ink-muted focus:border-accent focus:outline-2 focus:outline-accent/18 focus:outline-offset-1"
		aria-label="Primary replacement clause"
		placeholder="Write the text that would replace the clause you highlighted"
		bind:value={
			() =>
				concession.changes[0].replacement
					.map((atom) => (atom.kind === 'text' ? atom.text : ''))
					.join(''),
			(text) => (concession.changes[0].replacement = [{ kind: 'text', text }])
		}></textarea>
	<textarea
		class="block min-h-28 w-full resize-y rounded-base border border-line bg-surface px-3 py-2 text-ink placeholder:text-ink-muted focus:border-accent focus:outline-2 focus:outline-accent/18 focus:outline-offset-1"
		aria-label="Concession description"
		placeholder="Explain the concession in plain English so reps understand the change they're making"
		bind:value={concession.description}></textarea>
	<div>
		<button
			bind:this={optionsButton}
			type="button"
			class="flex w-full cursor-pointer items-center justify-between gap-3 rounded-base border border-line bg-surface px-3 py-2 text-left hover:bg-fill-subtle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
			aria-label="Concession options"
			aria-expanded={optionsOpen}
			aria-controls={optionsId}
			onclick={(event) => {
				keyboardOpen = event.detail === 0;
				optionsOpen = !optionsOpen;
			}}
			onkeydown={(event) => {
				if (event.key === 'ArrowDown') {
					event.preventDefault();
					keyboardOpen = true;
					optionsOpen = true;
				}
			}}
		>
			<span class={selectedOptions ? 'text-ink' : ''}>
				{selectedOptions || 'Options'}
			</span>
			<CaretDownIcon
				aria-hidden="true"
				size={16}
				class={`shrink-0 ${optionsOpen ? 'rotate-180' : ''}`}
			/>
		</button>
		<Popover
			open={optionsOpen}
			trigger={optionsButton}
			onClose={() => (optionsOpen = false)}
			keyboard={keyboardOpen}
			id={optionsId}
			label="Concession options"
		>
			<Checkbox
				label="This is a rare concession"
				checked={concession.tier === 'rare'}
				onCheckedChange={(checked) => (concession.tier = checked ? 'rare' : 'preferred')}
				className="rounded-md px-3 py-2 hover:bg-fill-subtle"
			/>
			<Checkbox
				label="This concession affects another part of the contract"
				checked={affectsOtherParts}
				onCheckedChange={onAffectedPart}
				className="rounded-md px-3 py-2 hover:bg-fill-subtle"
			/>
		</Popover>
	</div>
</div>
