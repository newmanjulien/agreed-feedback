import { getDocumentDomain } from '../domain/context';
import { countStartupWork } from './render-perf';
import { getContext, setContext, untrack } from 'svelte';
import { ContractSourceController, type ContractSourceInput } from './source.svelte';
import { ContractViewerState, ContractWorkspaceSession } from './session.svelte';
import { ContractRenderController } from './renderer.svelte';

const WORKSPACE = Symbol('contract-workspace');
function querySnapshot(input: ContractSourceInput): ContractSourceInput {
	return {
		blocks: { data: input.blocks.data, error: input.blocks.error },
		items: { data: input.items.data, error: input.items.error }
	};
}
export function createContractWorkspace(initial: ContractSourceInput) {
	countStartupWork('workspaceCreated');
	const source = new ContractSourceController(getDocumentDomain());
	const session = new ContractWorkspaceSession();
	let initialReplay: ContractSourceInput | undefined;

	function accept(input: ContractSourceInput) {
		// Track live query dependencies, not the state changed during acceptance.
		const current = querySnapshot(input);
		untrack(() => {
			const initial = initialReplay;
			initialReplay = undefined;
			if (
				!initial ||
				initial.blocks.data !== current.blocks.data ||
				initial.blocks.error !== current.blocks.error ||
				initial.items.data !== current.items.data ||
				initial.items.error !== current.items.error
			)
				source.accept(current);
			if (source.items) session.reconcile(source.items);
		});
	}

	const current = querySnapshot(initial);
	accept(current);
	// Skip only the first effect's exact replay; later updates use structural equality.
	initialReplay = current;
	return {
		source,
		session,
		renderer: new ContractRenderController(),
		viewer: new ContractViewerState(),
		accept
	};
}
export type ContractWorkspace = ReturnType<typeof createContractWorkspace>;
export function setContractWorkspace(workspace: ContractWorkspace) {
	return setContext(WORKSPACE, workspace);
}
export function getContractWorkspace(): ContractWorkspace {
	const workspace = getContext<ContractWorkspace>(WORKSPACE);
	if (!workspace) throw new Error('Contract workspace context is required.');
	return workspace;
}
