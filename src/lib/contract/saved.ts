import { ConvexError, type Infer } from 'convex/values';
import type { snapshot, selections } from '../../convex/savedContractValidators';
import type { Doc } from '../../convex/_generated/dataModel';

export type ContractSnapshot = Infer<typeof snapshot>;
export type SavedSelections = Infer<typeof selections>;
export const CONTRACT_SNAPSHOT_DEPENDENCY = 'contract:snapshot';
export type ContractRouteData = { id: string | null } & (
	| { status: 'ready'; snapshot: ContractSnapshot; contract?: Doc<'savedContracts'> }
	| { status: 'missing' | 'error' }
);
export function saveError(error: unknown, fallback: string) {
	return error instanceof ConvexError && typeof error.data === 'string' ? error.data : fallback;
}
