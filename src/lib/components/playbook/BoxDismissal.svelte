<script lang="ts">
	import { getInteractionController } from '$lib/components/ui/interactions';
	let {
		owner,
		active,
		onDismiss
	}: {
		owner: symbol;
		active: boolean;
		onDismiss: (restoreFocus: boolean) => void;
	} = $props();
	const interactions = getInteractionController();
	$effect(() => {
		if (!active) return;
		return interactions.register({
			id: owner,
			kind: 'panel',
			elements: () => [],
			close: (reason) => onDismiss(reason === 'escape')
		});
	});
</script>
