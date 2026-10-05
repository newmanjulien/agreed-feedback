import { loadContractSnapshot } from '$lib/server/contract';
import { CONTRACT_SNAPSHOT_DEPENDENCY } from '$lib/contract/saved';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent, depends, params }) => {
	await parent();
	depends(CONTRACT_SNAPSHOT_DEPENDENCY);
	return { contractRoute: await loadContractSnapshot(params.id) };
};
