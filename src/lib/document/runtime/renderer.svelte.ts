import { tick } from 'svelte';
import { ContractCompositionEngine } from '$lib/contract/compose';
import { sameSelection, type ContractChange } from '$lib/playbook/model';
import { paginatePreparedDocument } from '../pagination/paginate';
import { reconcilePages } from '../pagination/reconcile';
import { type LayoutProfiler, StaleLayoutProfileError } from '../pagination/profiler';
import { LayoutPreparationEngine, type PreparedBlock } from '../pagination/prepare';
import {
	countStartupWork,
	createPerfSample,
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
}
interface RenderRequest extends RenderCurrentInput {
	previewChanges: readonly ContractChange[];
	generation: number;
	perf?: RenderPerfSample;
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
	#running = false;
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
		this.snapshot = null;
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
			this.snapshot?.source.revision === source.revision &&
			sameSelection(this.snapshot.concessions, concessions) &&
			samePreviewChanges(this.snapshot.previewChanges, previewChanges)
		);
	}
	request(input: RenderCurrentInput) {
		if (this.#destroyed) return;
		const generation = ++this.#generation;
		this.#recordCancelled(this.#next);
		this.#next = {
			...input,
			concessions: Object.freeze({ ...input.concessions }),
			previewChanges: input.previewChanges ?? EMPTY_PREVIEW_CHANGES,
			generation,
			perf: createPerfSample(generation, input.source.revision)
		};
		this.pending = { generation, sourceRevision: input.source.revision };
		this.error = null;
		void this.#drain();
	}
	cancelPending() {
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
				this.#next = undefined;
				try {
					const result = await this.#render(request);
					if (!this.#isCurrent(request, result.layoutEpoch)) throw OBSOLETE;
					for (const listener of this.#commitListeners) listener();
					if (!this.#isCurrent(request, result.layoutEpoch)) throw OBSOLETE;
					this.#cancelPaintObservation?.();
					const assignedAt = request.perf ? performance.now() : 0;
					this.snapshot = result;
					this.pending = null;
					if (request.perf) {
						request.perf.snapshotAt = assignedAt;
						request.perf.totalMs = assignedAt - request.perf.requestedAt;
						recordPerfSample(request.perf);
						await tick();
						if (this.#destroyed || this.snapshot?.id !== request.generation) continue;
						request.perf.commitToDomMs = performance.now() - assignedAt;
						request.perf.settledTotalMs = performance.now() - request.perf.requestedAt;
						recordPerfSample(request.perf);
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
				if (this.#destroyed || request.generation !== this.snapshot?.id || sample.failed) return;
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
	async #render(request: RenderRequest): Promise<RenderSnapshot> {
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
		const composed = measure('composeMs', () => {
			try {
				return [
					...composer.compose({
						items: request.source.items,
						activeConcessions: request.concessions,
						previewChanges: request.previewChanges,
						view: 'redline'
					})
				];
			} finally {
				if (perf) {
					perf.blocksRecomposed = composer.recomposedBlocks;
					perf.affectedContainers = composer.affectedContainers;
				}
			}
		});
		const addresses = composer.addresses;
		if (perf) perf.compositionCompleteAt = performance.now();
		measure('prepareMs', () => {
			try {
				for (const block of composed) prepared.push(this.#preparation.prepare(block));
			} finally {
				if (perf) {
					perf.blocksProcessed = this.#preparation.preparedCount;
					perf.tokensProcessed = this.#preparation.tokenCount;
				}
			}
		});
		if (perf) perf.preparationCompleteAt = performance.now();
		checkCurrent();
		const profileStartedAt = perf ? performance.now() : 0;
		let profiles;
		try {
			profiles = await request.profiler.resolve(prepared, perf, checkCurrent);
		} finally {
			if (perf) perf.profileResolveMs = performance.now() - profileStartedAt;
		}
		checkCurrent();
		const candidates = measure('paginateMs', () => paginatePreparedDocument(prepared, profiles));
		if (perf) perf.paginationCompleteAt = performance.now();
		if (!candidates.length) throw new Error('Pagination produced no pages.');
		const { pages, changedPages, pagesReused } = measure('reconcileMs', () =>
			reconcilePages(candidates, epoch, this.snapshot ?? undefined)
		);
		if (perf) {
			perf.pageCount = pages.length;
			perf.pagesChanged = changedPages.length;
			perf.pagesReused = pagesReused;
		}
		for (const page of pages) {
			if (Object.isFrozen(page)) continue;
			page.placements.forEach((placement) => Object.freeze(placement));
			Object.freeze(page.placements);
			Object.freeze(page);
		}
		checkCurrent();
		return Object.freeze({
			id: request.generation,
			source: request.source,
			concessions: request.concessions,
			previewChanges: request.previewChanges,
			addresses,
			layoutEpoch: epoch,
			changedPages: Object.freeze(changedPages),
			pages: Object.freeze(pages)
		});
	}
}
