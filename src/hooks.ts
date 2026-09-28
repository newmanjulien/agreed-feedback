import { env } from '$env/dynamic/public';
import { initConvex, encodeConvexLoad, decodeConvexLoad } from 'convex-svelte/sveltekit';

if (env.PUBLIC_CONVEX_URL) initConvex(env.PUBLIC_CONVEX_URL);

export const transport = {
	ConvexLoadResult: { encode: encodeConvexLoad, decode: decodeConvexLoad }
};
