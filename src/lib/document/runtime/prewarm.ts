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
	for (const _ of composer.compose({
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
				for (const block of composer.compose(
					{ items: source.items, activeConcessions: selection, view: 'redline' },
					{ changedOnly: true }
				))
					yield preparation.prepare(block);
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
	const blocks = alternatives(snapshot);
	const seen = new Set(
		snapshot.pages.flatMap((page) =>
			page.placements.map(({ prepared }) => prepared.geometryFingerprint)
		)
	);
	let cancelIdle: (() => void) | undefined;
	const current = () =>
		!abort.signal.aborted &&
		profiler.epoch === snapshot.layoutEpoch &&
		profiler.cache.availableWarmSlots > 0;
	function schedule() {
		if (!current()) return;
		if (typeof window.requestIdleCallback === 'function') {
			const id = window.requestIdleCallback((deadline) => void run(() => deadline.timeRemaining()));
			cancelIdle = () => window.cancelIdleCallback(id);
		} else {
			// Browsers without idle callbacks still yield between small units of optional work.
			const id = setTimeout(() => {
				const started = performance.now();
				void run(() => 4 - (performance.now() - started));
			}, 100);
			cancelIdle = () => clearTimeout(id);
		}
	}
	async function run(timeRemaining: () => number) {
		cancelIdle = undefined;
		const started = performance.now();
		while (current() && timeRemaining() > 0 && performance.now() - started < 4) {
			const next = blocks.next();
			if (next.done) return;
			const block = next.value;
			if (!block || seen.has(block.geometryFingerprint)) continue;
			seen.add(block.geometryFingerprint);
			try {
				// Never queue a whole alternative document behind the shared surface.
				await profiler.prewarm(block, abort.signal);
			} catch {
				// Unsupported geometry does not make prewarming a rendering dependency.
			}
			break;
		}
		schedule();
	}
	schedule();
	return () => {
		abort.abort();
		cancelIdle?.();
		blocks.return(undefined);
	};
}
