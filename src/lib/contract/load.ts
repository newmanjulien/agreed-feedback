import { recordColdStart } from '$lib/document/runtime/render-perf';
import { env } from '$env/dynamic/public';
import { convexLoad } from 'convex-svelte/sveltekit';
import { api } from '../../convex/_generated/api';

export const loadContract = async () => {
	const startedAt = performance.now();
	recordColdStart('source-request');
	if (!env.PUBLIC_CONVEX_URL) {
		console.error('PUBLIC_CONVEX_URL is required to load the contract.');
		return {
			blocks: { data: undefined, error: true },
			items: { data: undefined, error: true }
		};
	}
	const [blocks, items] = await Promise.all([
		convexLoad(api.contract.getBlocks, {}).catch((error: unknown) => {
			console.error('Contract blocks query failed.', error);
			return { data: undefined, error: true as const };
		}),
		convexLoad(api.playbookItems.list, {}).catch((error: unknown) => {
			console.error('Playbook items query failed.', error);
			return { data: undefined, error: true as const };
		})
	]);
	recordColdStart('source-available', startedAt);
	return { blocks, items };
};
