import { env } from '$env/dynamic/public';
import { convexLoad } from 'convex-svelte/sveltekit';
import { api } from '../../convex/_generated/api';

export const load = async () => {
	if (!env.PUBLIC_CONVEX_URL) {
		console.error('PUBLIC_CONVEX_URL is required to load the contract.');
		return {
			convexConfigured: false,
			blocks: { data: undefined, error: true },
			boxes: { data: undefined, error: true }
		};
	}
	const [blocks, boxes] = await Promise.all([
		convexLoad(api.contract.getBlocks, {}).catch((error: unknown) => {
			console.error('Contract blocks query failed.', error);
			return { data: undefined, error: true as const };
		}),
		convexLoad(api.clauseBoxes.list, {}).catch((error: unknown) => {
			console.error('Clause boxes query failed.', error);
			return { data: undefined, error: true as const };
		})
	]);
	return { convexConfigured: true, blocks, boxes };
};
