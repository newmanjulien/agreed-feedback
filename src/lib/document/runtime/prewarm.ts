import { ContractCompositionEngine } from '$lib/contract/compose';
import { conflictsForConcession } from '$lib/playbook/selection-conflicts';
import { LayoutPreparationEngine, type PreparedBlock } from '../pagination/prepare';
import type { LayoutProfiler } from '../pagination/profiler';
import type { RenderSnapshot } from './types';

/** Enumerate single saved Apply/remove choices using the normal composition rules.
 * These engines are private to idle work: warming cannot disturb visible content identity.
 */
function* alternatives(snapshot: RenderSnapshot): Generator<PreparedBlock | undefined, void> {
	const { source, concessions } = snapshot;
	const composer = new ContractCompositionEngine(source.blocks, source.sourceIndex);
	const preparation = new LayoutPreparationEngine();
	// Establish current versions once, yielding between blocks without preparing them.
	for (const _ of composer.iterate({
		items: source.items,
		activeConcessions: concessions,
		view: 'redline'
	}))
		yield undefined;
	for (const item of source.items) {
		const choices: (string | undefined)[] = item.concessions.map((choice) => choice.id);
		if (concessions[item.itemId] !== undefined) choices.unshift(undefined);
		for (const choice of choices) {
			if (choice === concessions[item.itemId]) continue;
			try {
				if (
					choice !== undefined &&
					conflictsForConcession(source.sourceIndex, source.items, concessions, item.itemId, choice)
						.length
				)
					continue;
				const selection = { ...concessions };
				if (choice === undefined) delete selection[item.itemId];
				else selection[item.itemId] = choice;
				for (const block of composer.iterate(
					{ items: source.items, activeConcessions: selection, view: 'redline' },
					{ changedOnly: true }
				))
					yield block ? preparation.prepare(block) : undefined;
			} catch {
				// An invalid saved alternative is optional work; foreground validation owns errors.
			}
			yield undefined;
		}
	}
}

/** Only fills the ordinary geometry cache. No pagination, publication or authoring prediction. */
export function prewarmSavedConcessions(
	snapshot: RenderSnapshot,
	profiler: LayoutProfiler
): () => void {
	const abort = new AbortController();
	const release = profiler.trackAlternative(abort);
	const blocks = alternatives(snapshot);
	const seen = new Set<string>();
	function* visibleGeometry() {
		for (const page of snapshot.pages)
			for (const { prepared } of page.placements) {
				seen.add(prepared.geometryFingerprint);
				yield undefined;
			}
	}
	const initial = visibleGeometry();
	let initialized = false;
	const current = () =>
		!abort.signal.aborted &&
		profiler.epoch === snapshot.layoutEpoch &&
		profiler.cache.availableWarmSlots > 0;
	async function run() {
		try {
			while (current()) {
				const block = await profiler.scheduler.run(
					() => 'alternative',
					() => {
						if (!current()) return;
						const started = performance.now();
						do {
							if (!initialized) {
								initialized = Boolean(initial.next().done);
								continue;
							}
							const next = blocks.next();
							if (next.done) return null;
							if (!next.value || seen.has(next.value.geometryFingerprint)) continue;
							seen.add(next.value.geometryFingerprint);
							return next.value;
						} while (performance.now() - started < 4);
					},
					abort.signal
				);
				if (block === null) return;
				if (block && current()) {
					try {
						await profiler.resolve(
							[block],
							undefined,
							() => {
								if (!current()) throw new Error('Alternative preparation cancelled.');
							},
							() => 'alternative',
							abort.signal
						);
					} catch {
						/* Optional geometry. */
					}
				}
			}
		} catch {
			/* Layout teardown cancels optional work. */
		} finally {
			release();
			blocks.return(undefined);
		}
	}
	void run();
	return () => {
		abort.abort();
		release();
		blocks.return(undefined);
	};
}
