import { rm } from 'node:fs/promises';

await rm(new URL('../.vercel/output', import.meta.url), {
	recursive: true,
	force: true
});
