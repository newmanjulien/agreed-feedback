import { error, redirect } from '@sveltejs/kit';
import { COOKIE_NAME, gateConfigured, localDestination, validUnlock } from '$lib/server/gate';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ cookies, url }) => {
	if (!gateConfigured()) error(503, 'Site password is not configured.');
	// Reading the URL reruns this load on client-side navigation between app pages.
	const destination = localDestination(url.pathname + url.search);
	if (!validUnlock(cookies.get(COOKIE_NAME))) {
		redirect(303, `/gate?next=${encodeURIComponent(destination)}`);
	}
	return {};
};
