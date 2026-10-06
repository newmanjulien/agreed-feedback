<script lang="ts">
	import { untrack } from 'svelte';
	import type { ContractSnapshot } from '$lib/contract/saved';
	import { createContractWorkspace, setContractWorkspace } from '$lib/document/runtime/context';
	import ContractViewer from '$lib/components/document/ContractViewer.svelte';
	let { snapshot }: { snapshot: ContractSnapshot } = $props();
	const workspace = setContractWorkspace(
		untrack(() =>
			createContractWorkspace({
				blocks: { data: snapshot.blocks },
				items: { data: snapshot.items }
			})
		)
	);
	$effect(() =>
		workspace.accept({ blocks: { data: snapshot.blocks }, items: { data: snapshot.items } })
	);
</script>

<ContractViewer
	interactive={false}
	selectedConcessions={{}}
	allowPlaybookNavigation={false}
	onRemoveConcession={() => {}}
	onSelect={() => false}
>
	{#snippet panelContent()}{/snippet}
</ContractViewer>
