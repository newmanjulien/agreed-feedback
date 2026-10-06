import { getContext, setContext } from 'svelte';
import { DocumentScheduler } from './scheduler';
import { LayoutProfiler, type LayoutProfileSurface } from '../pagination/profiler';
const LAYOUT_PROFILES = Symbol('contract-layout-profiles');
/** One live browser/font environment. Contains geometry only, never a view snapshot. */
export class ContractLayoutProfiles {
	readonly scheduler = new DocumentScheduler();
	surface = $state.raw<LayoutProfileSurface>();
	profiler = $derived(
		this.surface ? new LayoutProfiler(this.surface, undefined, this.scheduler) : undefined
	);
}
export function setContractLayoutProfiles(profiles: ContractLayoutProfiles) {
	return setContext(LAYOUT_PROFILES, profiles);
}
/** Embedded viewers and the rollout fallback keep their own fresh profiling surface. */
export function getContractLayoutProfiles(): ContractLayoutProfiles | undefined {
	return getContext(LAYOUT_PROFILES);
}
