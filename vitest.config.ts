import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const local = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// These pure TypeScript tests don't need the SvelteKit build pipeline.
export default defineConfig({
	resolve: {
		alias: {
			$lib: local('./src/lib'),
			'$app/environment': local('./tests/perf/browser-inputs.ts'),
			'$app/navigation': local('./tests/perf/browser-inputs.ts'),
			'$env/dynamic/public': local('./tests/perf/browser-inputs.ts')
		}
	},
	test: {
		include: ['tests/perf/*.test.ts'],
		environment: 'node',
		restoreMocks: true,
		unstubGlobals: true
	}
});
