import { json } from '@sveltejs/kit';
import { loadContractSnapshot } from '$lib/server/contract';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const result = await loadContractSnapshot(params.id);
	return json(result, {
		status: result.status === 'missing' ? 404 : result.status === 'error' ? 502 : 200,
		headers: { 'cache-control': 'private, no-store' }
	});
};
