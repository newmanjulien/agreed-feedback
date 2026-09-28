import { dev } from '$app/environment';
import { error, fail, redirect } from '@sveltejs/kit';
import {
	COOKIE_MAX_AGE,
	COOKIE_NAME,
	correctPassword,
	gateConfigured,
	issueUnlock,
	localDestination,
	validUnlock
} from '$lib/server/gate';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ cookies, url }) => {
	if (!gateConfigured()) error(503, 'Site password is not configured.');
	const next = localDestination(url.searchParams.get('next'));
	if (validUnlock(cookies.get(COOKIE_NAME))) redirect(303, next);
	return { next };
};

export const actions: Actions = {
	default: async ({ request, cookies, url }) => {
		if (!gateConfigured()) error(503, 'Site password is not configured.');
		const next = localDestination(url.searchParams.get('next'));
		const form = await request.formData();
		const candidate = form.get('password');
		if (typeof candidate !== 'string' || !correctPassword(candidate)) {
			return fail(400, { incorrect: true });
		}

		cookies.set(COOKIE_NAME, issueUnlock(), {
			httpOnly: true,
			secure: !dev,
			sameSite: 'lax',
			path: '/',
			maxAge: COOKIE_MAX_AGE
		});
		redirect(303, next);
	}
};
