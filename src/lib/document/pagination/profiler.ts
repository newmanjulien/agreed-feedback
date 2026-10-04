import type { PreparedBlock } from './prepare';
import type { BlockLayoutProfile, LayoutProfiles } from './profile';
import { LayoutProfileCache } from './profile-cache';

const PREWARM_CANCELLED = Symbol('cancelled profile prewarm');

/** Request-local foreground counters. Idle warming never receives these metrics. */
export interface LayoutProfileMetrics {
	profileCacheHits: number;
	profileCacheMisses: number;
	profileUniqueMisses: number;
	profileBatchCount: number;
	profileDomUpdateMs: number;
	profileReadMs: number;
	profileTotalMs: number;
	/** Largest block's geometry-read time, summed across table passes. */
	maxProfileBlockMs: number;
}

export interface LayoutProfileBatch {
	readonly epoch: string;
	/** One whole-block profile per input, in input order. */
	readonly profiles: readonly BlockLayoutProfile[];
}

export interface LayoutProfileSurface {
	/** Undefined while fonts are loading or the surface is detached. Always read live. */
	readonly epoch: string | undefined;
	profile(
		blocks: readonly PreparedBlock[],
		expectedEpoch: string,
		metrics?: LayoutProfileMetrics
	): LayoutProfileBatch | Promise<LayoutProfileBatch>;
}

export class StaleLayoutProfileError extends Error {
	constructor() {
		super('Layout environment changed during profiling.');
		this.name = 'StaleLayoutProfileError';
	}
}

function validateAssociation(block: PreparedBlock, profile: BlockLayoutProfile): void {
	const fragment = block.fragment;
	if (
		profile.kind !== fragment.type ||
		(profile.kind === 'paragraph' &&
			fragment.type === 'paragraph' &&
			profile.tokenCount !== fragment.tokens.length) ||
		(profile.kind === 'table' &&
			fragment.type === 'table' &&
			(profile.headerRowCount !== fragment.headerRowCount ||
				profile.bodyRowHeights.length !== fragment.rows.length - fragment.headerRowCount ||
				fragment.rows.some((row) => row.length !== profile.columnWidths.length)))
	)
		throw new Error('Layout profile does not match its prepared block.');
}

/** Serializes shared-surface requests; deduplicates geometry before any DOM work.
 * Returned associations always use the current request's prepared objects, never cached content.
 */
export class LayoutProfiler {
	#pending: Promise<unknown> = Promise.resolve();
	#foregroundRevision = 0;

	constructor(
		readonly surface: LayoutProfileSurface,
		readonly cache = new LayoutProfileCache()
	) {}

	get epoch(): string | undefined {
		return this.surface.epoch;
	}

	resolve(
		blocks: readonly PreparedBlock[],
		metrics?: LayoutProfileMetrics,
		checkCurrent?: () => void
	): Promise<LayoutProfiles> {
		++this.#foregroundRevision;
		const epoch = this.surface.epoch;
		if (epoch === undefined) return Promise.reject(new StaleLayoutProfileError());
		const input = [...blocks];
		const work = this.#pending.then(() => this.#resolve(input, epoch, metrics, checkCurrent, true));
		// A failed request must not poison the queue for a newer epoch/request.
		this.#pending = work.catch(() => {});
		return work;
	}

	/** One idle shape at a time; foreground arrivals invalidate queued/in-flight warm work. */
	prewarm(block: PreparedBlock, signal: AbortSignal): Promise<void> {
		const epoch = this.surface.epoch;
		if (epoch === undefined || signal.aborted) return Promise.resolve();
		const revision = this.#foregroundRevision;
		const work = this.#pending.then(async () => {
			try {
				await this.#resolve([block], epoch, undefined, () => {
					if (signal.aborted || revision !== this.#foregroundRevision) throw PREWARM_CANCELLED;
				});
			} catch (cause) {
				if (cause !== PREWARM_CANCELLED) throw cause;
			}
		});
		this.#pending = work.catch(() => {});
		return work;
	}

	async #resolve(
		blocks: readonly PreparedBlock[],
		epoch: string,
		metrics?: LayoutProfileMetrics,
		checkCurrent?: () => void,
		retainActive = false
	): Promise<LayoutProfiles> {
		const checkEpoch = () => {
			checkCurrent?.();
			if (this.surface.epoch !== epoch) throw new StaleLayoutProfileError();
		};
		checkEpoch();
		this.cache.useEpoch(epoch);
		const byFingerprint = new Map<string, BlockLayoutProfile>();
		const misses = new Map<string, PreparedBlock>();
		for (const block of blocks) {
			const key = block.geometryFingerprint;
			if (!byFingerprint.has(key) && !misses.has(key)) {
				const cached = this.cache.get(epoch, key);
				if (cached) byFingerprint.set(key, cached);
				else misses.set(key, block);
			}
			if (metrics) {
				if (byFingerprint.has(key)) metrics.profileCacheHits++;
				else metrics.profileCacheMisses++;
			}
		}
		if (metrics) metrics.profileUniqueMisses += misses.size;
		if (misses.size) {
			const candidates = [...misses.values()];
			const startedAt = metrics ? performance.now() : 0;
			if (metrics) metrics.profileBatchCount++;
			let batch: LayoutProfileBatch;
			try {
				batch = await this.surface.profile(candidates, epoch, metrics);
			} finally {
				if (metrics) metrics.profileTotalMs += performance.now() - startedAt;
			}
			checkEpoch();
			if (batch.epoch !== epoch) throw new StaleLayoutProfileError();
			if (batch.profiles.length !== candidates.length)
				throw new Error('Layout profile batch has missing or extra blocks.');
			// Check all content associations before the cache validates/inserts the batch.
			const geometry = new Map(
				candidates.map((block, i) => {
					const profile = batch.profiles[i];
					validateAssociation(block, profile);
					return [block.geometryFingerprint, profile];
				})
			);
			for (const [key, profile] of this.cache.setBatch(epoch, geometry))
				byFingerprint.set(key, profile);
		}
		checkEpoch();
		const profiles: LayoutProfiles = new Map(
			blocks.map((block) => {
				const profile = byFingerprint.get(block.geometryFingerprint)!;
				validateAssociation(block, profile);
				return [block, profile];
			})
		);
		if (retainActive) this.cache.retain(epoch, byFingerprint);
		return profiles;
	}
}
