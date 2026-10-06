import type { ContractRouteData } from './saved';

export async function readContract(
	request: typeof fetch,
	id: string,
	signal?: AbortSignal
): Promise<ContractRouteData> {
	const response = await request(`/api/contracts/${encodeURIComponent(id)}`, {
		cache: 'no-store',
		signal
	});
	if (!response.ok && response.status !== 404) throw new Error('Contract read failed.');
	return response.json();
}
