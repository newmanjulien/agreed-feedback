import type { Action } from 'svelte/action';
import { untrack } from 'svelte';
import { observeHomeWarming } from '$lib/document/runtime/render-perf';
import { getDocumentResources } from '$lib/document/runtime/resources.svelte';
import { getContractSnapshotCache } from './snapshot-cache';
import { rankCards, type CachedCard } from './browser-storage';

/** One viewport observer and one preparation policy for both Home and search. */
export function createVisibleContractWarming() {
	const resources = getDocumentResources();
	const cards = new Map<Element, CachedCard>();
	const visible = new Set<string>();
	const promoted = new Set<string>();
	let pending = false;
	let releaseObservation: (() => void) | undefined;
	let destroyed = false;
	let observer: IntersectionObserver | undefined;
	let cache: ReturnType<typeof getContractSnapshotCache> | undefined;
	$effect(() => {
		const ids = resources?.preparationCandidates ?? [];
		untrack(() => {
			if (destroyed) return;
			for (const id of ids) {
				cache?.queue(id);
				const data = cache?.peek(id);
				if (data) resources?.prepare(data);
			}
		});
	});
	function candidates() {
		if (destroyed) return;
		const ranked = rankCards(
			[...cards.entries()]
				.filter(([, card]) => visible.has(card._id))
				.sort(([a], [b]) =>
					a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
				)
				.map(([, card]) => card),
			[...promoted]
		);
		const ids = pending ? ranked.filter((id) => promoted.has(id)) : ranked;
		resources?.candidates(ids);
		for (const id of ids) cache?.queue(id);
	}
	const observe: Action<HTMLElement, CachedCard> = (node, card) => {
		releaseObservation ??= observeHomeWarming();
		cache ??= getContractSnapshotCache();
		if (typeof IntersectionObserver !== 'undefined') {
			observer ??= new IntersectionObserver((entries) => {
				for (const entry of entries) {
					const card = cards.get(entry.target);
					if (!card) continue;
					if (entry.isIntersecting) {
						visible.add(card._id);
						cache?.queue(card._id);
					} else {
						visible.delete(card._id);
						cache?.cancelQueued(card._id);
					}
				}
				candidates();
			});
		}
		cards.set(node, card);
		if (observer) observer.observe(node);
		else {
			visible.add(card._id);
			cache.queue(card._id);
			candidates();
		}
		return {
			update(next) {
				card = next;
				cards.set(node, next);
				candidates();
			},
			destroy() {
				observer?.unobserve(node);
				cards.delete(node);
				visible.delete(card._id);
				promoted.delete(card._id);
				cache?.cancelQueued(card._id);
				candidates();
			}
		};
	};
	return {
		observe,
		pending(value: boolean) {
			pending = value;
			candidates();
		},
		warm(id: string) {
			resources?.promote(id);
			promoted.add(id);
			visible.add(id);
			(cache ??= getContractSnapshotCache()).promote(id);
			candidates();
		},
		cool(id: string) {
			if (promoted.delete(id)) candidates();
		},
		destroy() {
			destroyed = true;
			releaseObservation?.();
			observer?.disconnect();
			for (const card of cards.values()) cache?.cancelQueued(card._id);
			cards.clear();
			visible.clear();
			promoted.clear();
			resources?.candidates([]);
		}
	};
}
