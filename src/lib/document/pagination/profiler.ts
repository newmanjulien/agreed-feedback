import type { PreparedBlock } from './prepare';
import type { BlockLayoutProfile, LayoutProfiles } from './profile';
import { LayoutProfileCache } from './profile-cache';
import { DocumentScheduler, type Priority } from '../runtime/scheduler';

/** Request-local counters for foreground rendering and background preparation. */
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
	#preparationRevision = 0;
	#alternatives = new Set<AbortController>();
	#retained?: { owner: symbol; epoch: string };

	constructor(
		readonly surface: LayoutProfileSurface,
		readonly cache = new LayoutProfileCache(),
		readonly scheduler = new DocumentScheduler()
	) {}

	get epoch(): string | undefined {
		return this.surface.epoch;
	}

	beginPreparation() {
		++this.#preparationRevision;
		for (const abort of this.#alternatives) abort.abort();
		this.#alternatives.clear();
	}

	trackAlternative(abort: AbortController) {
		this.#alternatives.add(abort);
		return () => this.#alternatives.delete(abort);
	}

	async resolve(
		blocks: readonly PreparedBlock[],
		metrics?: LayoutProfileMetrics,
		checkCurrent?: () => void,
		priority: Priority = () => 'foreground',
		signal?: AbortSignal
	): Promise<LayoutProfiles> {
		if (priority() !== 'alternative') this.beginPreparation();
		const revision = this.#preparationRevision;
		const epoch = this.surface.epoch;
		if (epoch === undefined) throw new StaleLayoutProfileError();
		const check = () => {
			signal?.throwIfAborted();
			checkCurrent?.();
			if (this.surface.epoch !== epoch) throw new StaleLayoutProfileError();
			if (priority() === 'alternative' && revision !== this.#preparationRevision)
				throw new Error('Alternative preparation cancelled.');
		};
		// Request-local geometry survives eviction from the optional cache.
		const geometry = new Map<string, BlockLayoutProfile>();
		const misses = new Map<string, PreparedBlock>();
		const profiles = new Map<PreparedBlock, BlockLayoutProfile>();
		let cursor = 0;
		while (cursor < blocks.length) {
			await this.scheduler.run(
				priority,
				() => {
					check();
					this.cache.useEpoch(epoch);
					const started = performance.now();
					let count = 0;
					do {
						const block = blocks[cursor++],
							key = block.geometryFingerprint;
						if (!geometry.has(key) && !misses.has(key)) {
							const cached = this.cache.get(epoch, key);
							if (cached) geometry.set(key, cached);
							else misses.set(key, block);
						}
						const profile = geometry.get(key);
						if (profile) {
							validateAssociation(block, profile);
							profiles.set(block, profile);
						}
						if (metrics) {
							if (profile) metrics.profileCacheHits++;
							else metrics.profileCacheMisses++;
						}
					} while (cursor < blocks.length && ++count < 128 && performance.now() - started < 4);
				},
				signal
			);
		}
		if (metrics) metrics.profileUniqueMisses += misses.size;
		const missing = misses.values();
		let next = missing.next();
		while (!next.done) {
			await this.scheduler.run(
				priority,
				async () => {
					check();
					// A foreground promotion is read at dispatch. Background reads one shape.
					const candidates = [next.value!];
					next = missing.next();
					if (priority() === 'foreground') {
						while (!next.done) {
							candidates.push(next.value);
							next = missing.next();
						}
					}
					// Another serialized request may have measured these shapes while we waited.
					const pending = candidates.filter((block) => {
						const profile = this.cache.get(epoch, block.geometryFingerprint);
						if (profile) geometry.set(block.geometryFingerprint, profile);
						return !profile;
					});
					if (!pending.length) return;
					const started = metrics ? performance.now() : 0;
					if (metrics) metrics.profileBatchCount++;
					let batch: LayoutProfileBatch;
					try {
						// Measurement starts inside this callback, with serialized surface access.
						check();
						batch = await this.surface.profile(pending, epoch, metrics);
					} finally {
						if (metrics) metrics.profileTotalMs += performance.now() - started;
					}
					check();
					if (batch.epoch !== epoch) throw new StaleLayoutProfileError();
					if (batch.profiles.length !== pending.length)
						throw new Error('Layout profile batch has missing or extra blocks.');
					const measured = new Map(
						pending.map((block, index) => {
							const profile = batch.profiles[index];
							validateAssociation(block, profile);
							return [block.geometryFingerprint, profile] as const;
						})
					);
					for (const [key, profile] of this.cache.setBatch(epoch, measured))
						geometry.set(key, profile);
				},
				signal
			);
		}
		cursor = 0;
		// Cache-hit associations were already checked in the first bounded pass.
		while (profiles.size < blocks.length && cursor < blocks.length) {
			await this.scheduler.run(
				priority,
				() => {
					check();
					const started = performance.now();
					let count = 0;
					do {
						const block = blocks[cursor++];
						if (!profiles.has(block)) {
							const profile = geometry.get(block.geometryFingerprint)!;
							validateAssociation(block, profile);
							profiles.set(block, profile);
						}
					} while (cursor < blocks.length && ++count < 128 && performance.now() - started < 4);
				},
				signal
			);
		}
		check();
		return profiles;
	}

	retain(blocks: readonly PreparedBlock[], profiles: LayoutProfiles, epoch: string, owner: symbol) {
		if (this.epoch !== epoch || (this.#retained?.owner === owner && this.#retained.epoch === epoch))
			return;
		this.cache.useEpoch(epoch);
		this.cache.retain(
			epoch,
			new Map(blocks.map((block) => [block.geometryFingerprint, profiles.get(block)!]))
		);
		this.#retained = { owner, epoch };
	}
	release(owner: symbol) {
		if (this.#retained?.owner !== owner) return;
		this.cache.release(this.#retained.epoch);
		this.#retained = undefined;
	}
}
