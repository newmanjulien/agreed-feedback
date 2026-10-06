import type { PageLoad } from './$types';

export const load: PageLoad = async ({ parent, params }) => {
	await parent();
	return { contractRoute: { id: params.id, status: 'loading' as const } };
};
