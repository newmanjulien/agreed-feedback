import { preloadCode } from '$app/navigation';
import { onMount, getContext, setContext } from 'svelte';
import { useQuery } from 'convex-svelte';
import { api } from '../../convex/_generated/api';
import type { ContractSourceInput } from '$lib/document/runtime/source.svelte';
import { recordAdminQueryOwner, recordColdStart } from '$lib/document/runtime/render-perf';

const ADMIN_QUERIES = Symbol('admin-queries');

/** Shared live results feed the retained source; authoring remains route-owned. */
export function createAdminQueries(configured: boolean) {
	let mounted = $state(false);
	let codeSettled = $state(false);
	let startedAt = 0;
	let recordedData = false;
	let recordedReady = false;
	const data: ContractSourceInput = configured
		? {
				blocks: useQuery(api.contract.getBlocks, () => (mounted ? {} : 'skip')),
				items: useQuery(api.playbookItems.list, () => (mounted ? {} : 'skip'))
			}
		: { blocks: { error: true }, items: { error: true } };
	const settled = $derived(
		mounted &&
			(data.blocks.data !== undefined || Boolean(data.blocks.error)) &&
			(data.items.data !== undefined || Boolean(data.items.error))
	);
	onMount(() => {
		let active = true;
		startedAt = performance.now();
		recordColdStart('admin-preload-start');
		void preloadCode('/admin').then(
			() => {
				if (!active) return;
				recordColdStart('admin-code-ready', startedAt);
				codeSettled = true;
			},
			() => {
				if (!active) return;
				recordColdStart('admin-code-error', startedAt);
				codeSettled = true;
			}
		);
		mounted = true;
		const releaseOwner = configured ? recordAdminQueryOwner() : undefined;
		return () => {
			active = false;
			releaseOwner?.();
		};
	});
	$effect(() => {
		if (!settled) return;
		if (!recordedData) {
			recordedData = true;
			recordColdStart('admin-data-ready', startedAt);
		}
		if (codeSettled && !recordedReady) {
			recordedReady = true;
			recordColdStart('admin-preload-ready', startedAt);
		}
	});
	return data;
}

export function setAdminQueries(data: ReturnType<typeof createAdminQueries>) {
	return setContext(ADMIN_QUERIES, data);
}

export function getAdminQueries(): ReturnType<typeof createAdminQueries> {
	const data = getContext<ReturnType<typeof createAdminQueries>>(ADMIN_QUERIES);
	if (!data) throw new Error('Admin query context is required.');
	return data;
}
