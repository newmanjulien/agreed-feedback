import { tick } from 'svelte';
import type { Priority } from './scheduler';
import type { LayoutProfiles } from '../pagination/profile';
import { ContractCompositionEngine } from '$lib/contract/compose';
import { sameSelection, type ContractChange } from '$lib/playbook/model';
import { paginatePreparedDocument } from '../pagination/paginate';
import { iterateReconciledPages } from '../pagination/reconcile';
import { type LayoutProfiler, StaleLayoutProfileError } from '../pagination/profiler';
import { LayoutPreparationEngine, type PreparedBlock } from '../pagination/prepare';
import {
	countStartupWork,
	createPerfSample,
	recordColdStart,
	recordPerfSample,
	type RenderPerfSample
} from './render-perf';
import {
	samePreviewChanges,
	EMPTY_PREVIEW_CHANGES,
	type ConcessionSelection,
	type ContractRenderSource,
	type RenderSnapshot,
	type RenderFailure,
	type RenderJobMeta
} from './types';

const OBSOLETE = Symbol('obsolete render');

interface RenderCurrentInput {
	source: ContractRenderSource;
	concessions: ConcessionSelection;
	/** Caller-owned preview changes must be immutable for the request's lifetime. */
	previewChanges?: readonly ContractChange[];
	profiler: LayoutProfiler;
	priority?: Priority;
}
interface RenderRequest extends RenderCurrentInput {
	previewChanges: readonly ContractChange[];
	generation: number;
	perf?: RenderPerfSample;
	abort: AbortController;
}

/** Latest-request worker: compose, prepare, profile, paginate, reconcile, commit. */
export class ContractRenderController {
	constructor() {
		countStartupWork('rendererCreated');
	}
	snapshot = $state.raw<RenderSnapshot | null>(null);
	pending = $state.raw<RenderJobMeta | null>(null);
	error = $state.raw<RenderFailure | null>(null);
	#generation = 0;
	#next?: RenderRequest;
	#inflight?: RenderRequest;
	#running = false;
	#abort?: AbortController;
	#geometry?: {
		blocks: readonly PreparedBlock[];
		profiles: LayoutProfiles;
		epoch: string;
		owner: symbol;
	};
	#protectedGeometry?: { profiler: LayoutProfiler; owner: symbol };
	#composition?: ContractCompositionEngine;
	#preparation = new LayoutPreparationEngine();
	#commitListeners = new Set<() => void>();
	#cancelPaintObservation?: () => void;
	#destroyed = false;
	destroy() {
		this.#destroyed = true;
		this.cancelPending();
		this.#cancelPaintObservation?.();
		this.#commitListeners.clear();
		this.#composition = undefined;
		this.#preparation = new LayoutPreparationEngine();
		this.#protectedGeometry?.profiler.release(this.#protectedGeometry.owner);
		this.#protectedGeometry = undefined;
		this.snapshot = null;
		this.#geometry = undefined;
	}
	beforeCommit(listener: () => void) {
		this.#commitListeners.add(listener);
		return () => {
			this.#commitListeners.delete(listener);
		};
	}
	isCurrent({
		source,
		concessions,
		profiler,
		previewChanges = EMPTY_PREVIEW_CHANGES
	}: RenderCurrentInput) {
		return (
			profiler.epoch !== undefined &&
			this.snapshot?.layoutEpoch === profiler.epoch &&
			this.snapshot?.source === source &&
			sameSelection(this.snapshot.concessions, concessions) &&
			samePreviewChanges(this.snapshot.previewChanges, previewChanges)
		);
	}
	protectGeometry(profiler: LayoutProfiler) {
		const geometry = this.#geometry;
		if (!geometry || geometry.epoch !== profiler.epoch) return;
		if (
			this.#protectedGeometry?.profiler !== profiler ||
			this.#protectedGeometry.owner !== geometry.owner
		)
			this.#protectedGeometry?.profiler.release(this.#protectedGeometry.owner);
		profiler.retain(geometry.blocks, geometry.profiles, geometry.epoch, geometry.owner);
		this.#protectedGeometry = { profiler, owner: geometry.owner };
	}
	request(input: RenderCurrentInput) {
		if (this.#destroyed) return;
		const queued = this.#next ?? this.#inflight;
		if (
			this.pending &&
			queued &&
			queued.source === input.source &&
			queued.profiler === input.profiler &&
			sameSelection(queued.concessions, input.concessions) &&
			samePreviewChanges(queued.previewChanges, input.previewChanges ?? EMPTY_PREVIEW_CHANGES)
		)
			return;
		input.profiler.beginPreparation();
		this.#abort?.abort(OBSOLETE);
		const abort = (this.#abort = new AbortController());
		const generation = ++this.#generation;
		this.#recordCancelled(this.#next);
		this.#next = {
			...input,
			abort,
			concessions: Object.freeze({ ...input.concessions }),
			previewChanges: input.previewChanges ?? EMPTY_PREVIEW_CHANGES,
			generation,
			perf: createPerfSample(generation, input.source.revision)
		};
		if (this.#next.perf) this.#next.perf.priority = input.priority?.() ?? 'foreground';
		if (input.priority?.() === 'background')
			recordColdStart('background-document-preparation-start');
		this.pending = { generation, sourceRevision: input.source.revision };
		this.error = null;
		void this.#drain();
	}
	cancelPending() {
		this.#abort?.abort(OBSOLETE);
		this.#abort = undefined;
		++this.#generation;
		this.#recordCancelled(this.#next);
		this.#next = undefined;
		this.pending = null;
		this.error = null;
	}
	// Validation failures use the same non-destructive technical-error boundary as rendering.
	fail(error: RenderFailure) {
		this.cancelPending();
		this.error = error;
	}
	#recordCancelled(request?: RenderRequest) {
		if (!request?.perf) return;
		request.perf.cancelled = true;
		request.perf.totalMs = performance.now() - request.perf.requestedAt;
		recordPerfSample(request.perf);
	}
	async #drain() {
		if (this.#running) return;
		this.#running = true;
		try {
			while (this.#next) {
				const request = this.#next;
				this.#inflight = request;
				this.#next = undefined;
				try {
					const result = await this.#render(request);
					if (!this.#isCurrent(request, result.snapshot.layoutEpoch)) throw OBSOLETE;
					for (const listener of this.#commitListeners) listener();
					if (!this.#isCurrent(request, result.snapshot.layoutEpoch)) throw OBSOLETE;
					this.#cancelPaintObservation?.();
					const assignedAt = request.perf ? performance.now() : 0;
					this.#geometry = result.geometry;
					this.snapshot = result.snapshot;
					this.pending = null;
					if (request.perf?.priority === 'background')
						recordColdStart('background-document-preparation-ready', request.perf.requestedAt);
					if (request.perf) {
						request.perf.snapshotAt = assignedAt;
						request.perf.totalMs = assignedAt - request.perf.requestedAt;
						recordPerfSample(request.perf);
						await tick();
						if (this.#destroyed || this.snapshot?.id !== request.generation) continue;
						request.perf.commitToDomMs = performance.now() - assignedAt;
						request.perf.settledTotalMs = performance.now() - request.perf.requestedAt;
						recordPerfSample(request.perf);
						if ((request.priority?.() ?? 'foreground') === 'foreground')
							this.#observePaint(request);
					}
				} catch (cause) {
					if (
						cause === OBSOLETE ||
						cause instanceof StaleLayoutProfileError ||
						request.generation !== this.#generation
					) {
						if (request.generation === this.#generation) this.cancelPending();
						this.#recordCancelled(request);
						continue;
					}
					if (request.perf) {
						request.perf.failed = true;
						request.perf.totalMs = performance.now() - request.perf.requestedAt;
						recordPerfSample(request.perf);
					}
					this.pending = null;
					this.error = { message: 'We couldn’t update the contract.', cause };
					console.error('Contract rendering failed.', cause);
				}
			}
		} finally {
			this.#inflight = undefined;
			this.#running = false;
			if (this.#next) void this.#drain();
		}
	}
	#observePaint(request: RenderRequest) {
		const sample = request.perf;
		if (!sample) return;
		this.#cancelPaintObservation?.();
		let timer: ReturnType<typeof setTimeout> | undefined;
		const frame = requestAnimationFrame(() => {
			timer = setTimeout(() => {
				this.#cancelPaintObservation = undefined;
				// The displayed snapshot remains valid while a warm request is pending.
				if (
					this.#destroyed ||
					request.generation !== this.snapshot?.id ||
					sample.failed ||
					(request.priority?.() ?? 'foreground') !== 'foreground'
				)
					return;
				sample.paintOpportunityAt = performance.now();
				sample.inputToPaintOpportunityMs = sample.paintOpportunityAt - sample.inputAt;
				recordPerfSample(sample);
			}, 0);
		});
		this.#cancelPaintObservation = () => {
			cancelAnimationFrame(frame);
			clearTimeout(timer);
		};
	}
	#isCurrent(request: RenderRequest, epoch: string) {
		return (
			!this.#destroyed &&
			request.generation === this.#generation &&
			request.profiler.epoch === epoch
		);
	}
	async #render(request: RenderRequest): Promise<{
		snapshot: RenderSnapshot;
		geometry: {
			blocks: readonly PreparedBlock[];
			profiles: LayoutProfiles;
			epoch: string;
			owner: symbol;
		};
	}> {
		// Leave the effect flush before the profile surface uses flushSync.
		await tick();
		if (request.generation !== this.#generation) throw OBSOLETE;
		const epoch = request.profiler.epoch;
		if (epoch === undefined) throw new StaleLayoutProfileError();
		const checkCurrent = () => {
			if (!this.#isCurrent(request, epoch)) throw OBSOLETE;
		};
		const perf = request.perf;
		const measure = <T>(
			field: 'composeMs' | 'prepareMs' | 'paginateMs' | 'reconcileMs',
			work: () => T
		): T => {
			if (!perf) return work();
			const startedAt = performance.now();
			try {
				return work();
			} finally {
				perf[field] = performance.now() - startedAt;
			}
		};
		if (perf) {
			perf.layoutEpoch = epoch;
			perf.renderStartedAt = performance.now();
		}
		if (this.#composition?.index !== request.source.sourceIndex) {
			this.#composition = new ContractCompositionEngine(
				request.source.blocks,
				request.source.sourceIndex
			);
			this.#preparation = new LayoutPreparationEngine();
		}
		const composer = this.#composition;
		const prepared: PreparedBlock[] = [];
		this.#preparation.begin();
		const priority = request.priority ?? (() => 'foreground');
		const iterator = composer.iterate({
			items: request.source.items,
			activeConcessions: request.concessions,
			previewChanges: request.previewChanges,
			view: 'redline'
		});
		let done = false;
		try {
			while (!done)
				await request.profiler.scheduler.run(
					priority,
					() => {
						checkCurrent();
						const started = performance.now();
						do {
							const composeStart = performance.now();
							const next = iterator.next();
							if (perf) perf.composeMs += performance.now() - composeStart;
							if (next.done) {
								done = true;
								break;
							}
							if (!next.value) continue;
							const prepareStart = performance.now();
							prepared.push(this.#preparation.prepare(next.value));
							if (perf) perf.prepareMs += performance.now() - prepareStart;
						} while (performance.now() - started < 4);
					},
					request.abort.signal
				);
		} finally {
			iterator.return(undefined);
			if (perf) {
				perf.blocksRecomposed = composer.recomposedBlocks;
				perf.affectedContainers = composer.affectedContainers;
				perf.blocksProcessed = this.#preparation.preparedCount;
				perf.tokensProcessed = this.#preparation.tokenCount;
			}
		}
		const addresses = composer.addresses;
		if (perf) {
			perf.compositionCompleteAt = performance.now();
			perf.preparationCompleteAt = performance.now();
		}
		checkCurrent();
		const profileStartedAt = perf ? performance.now() : 0;
		let profiles;
		try {
			profiles = await request.profiler.resolve(
				prepared,
				perf,
				checkCurrent,
				priority,
				request.abort.signal
			);
		} finally {
			if (perf) perf.profileResolveMs = performance.now() - profileStartedAt;
		}
		checkCurrent();
		const candidates = await request.profiler.scheduler.run(
			priority,
			() => {
				checkCurrent();
				return measure('paginateMs', () => paginatePreparedDocument(prepared, profiles));
			},
			request.abort.signal
		);
		if (perf) perf.paginationCompleteAt = performance.now();
		if (!candidates.length) throw new Error('Pagination produced no pages.');
		const reconciliation = iterateReconciledPages(candidates, epoch, this.snapshot ?? undefined);
		let reconciled: ReturnType<typeof reconciliation.next>;
		try {
			do {
				reconciled = await request.profiler.scheduler.run(
					priority,
					() => {
						checkCurrent();
						const started = performance.now();
						let next: ReturnType<typeof reconciliation.next>;
						do {
							next = reconciliation.next();
						} while (!next.done && performance.now() - started < 4);
						if (perf) perf.reconcileMs += performance.now() - started;
						return next;
					},
					request.abort.signal
				);
			} while (!reconciled.done);
		} finally {
			reconciliation.return({ pages: [], changedPages: [], pagesReused: 0 });
		}
		const { pages, changedPages, pagesReused } = reconciled.value;
		if (perf) {
			perf.pageCount = pages.length;
			perf.pagesChanged = changedPages.length;
			perf.pagesReused = pagesReused;
		}
		checkCurrent();
		const geometry = { blocks: prepared, profiles, epoch, owner: Symbol('render-geometry') };
		const snapshot = Object.freeze({
			id: request.generation,
			source: request.source,
			concessions: request.concessions,
			previewChanges: request.previewChanges,
			addresses,
			layoutEpoch: epoch,
			changedPages: Object.freeze(changedPages),
			pages: Object.freeze(pages)
		});
		return { snapshot, geometry };
	}
}
