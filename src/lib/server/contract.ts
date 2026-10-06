import { ConvexHttpClient } from 'convex/browser';
import { env } from '$env/dynamic/public';
import { api } from '../../convex/_generated/api';
import type { ContractRouteData } from '$lib/contract/saved';

export async function loadContractSnapshot(id: string): Promise<ContractRouteData> {
	try {
		if (!env.PUBLIC_CONVEX_URL) throw new Error('Missing Convex configuration');
		const client = new ConvexHttpClient(env.PUBLIC_CONVEX_URL);
		const result = await client.query(api.savedContracts.load, { id });
		return result ? { id, status: 'ready', ...result } : { id, status: 'missing' };
	} catch {
		return { id, status: 'error' };
	}
}
