import { error, json } from '@sveltejs/kit';
import { COOKIE_NAME, gateConfigured, validUnlock } from '$lib/server/gate';
import { loadContractSnapshot } from '$lib/server/contract';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ cookies, params }) => {
	// Endpoint handlers do not run the app layout's password check.
	if (!gateConfigured()) error(503, 'Site password is not configured.');
	if (!validUnlock(cookies.get(COOKIE_NAME))) error(401, 'Unlock the app to read contracts.');
	const result = await loadContractSnapshot(params.id);
	return json(result, {
		status: result.status === 'missing' ? 404 : result.status === 'error' ? 502 : 200,
		headers: { 'cache-control': 'private, no-store' }
	});
};
