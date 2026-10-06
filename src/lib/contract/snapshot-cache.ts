import { browser } from '$app/environment';
import { preloadCode } from '$app/navigation';
import { recordColdStart } from '$lib/document/runtime/render-perf';
import { readContract } from './read';
import {
	SnapshotStorage,
	validSnapshot,
	SNAPSHOT_ENTRIES,
	SNAPSHOT_BYTES
} from './snapshot-storage';
import { forgetOpening, reconcileCards } from './browser-storage';
import type { ContractRouteData, ContractState } from './saved';

type ReadyContract = Extract<ContractRouteData, { status: 'ready' }>;
type Entry = { data: ReadyContract; bytes: number; immutableBytes: number };
type Flight = { result: Promise<ContractRouteData>; controller: AbortController };
const MAX_ENTRIES = SNAPSHOT_ENTRIES;
const MAX_BYTES = SNAPSHOT_BYTES;
const BACKGROUND_CONCURRENCY = 2;

/** Browser-only, layout-scoped snapshots. Mutable contract state is refreshed on every open. */
class ContractSnapshotCache {
	private disk = new SnapshotStorage();
	private deleted = new Set<string>();
	private entries = new Map<string, Entry>();
	private flights = new Map<string, Flight>();
	private queued = new Set<string>();
	private bytes = 0;
	private background = 0;
	private ready = false;
	private lifetime = new AbortController();
	private code: Promise<void> | undefined;
	private listeners = new Set<(data: ReadyContract) => void>();
	private evictions = new Set<(id: string) => void>();
	private failures = new Set<(id: string) => void>();
	private visibility = () => this.pump();
	constructor() {
		document.addEventListener('visibilitychange', this.visibility);
	}
	subscribe(
		listener: (data: ReadyContract) => void,
		evict: (id: string) => void,
		failed: (id: string) => void
	) {
		this.listeners.add(listener);
		this.evictions.add(evict);
		this.failures.add(failed);
		return () => {
			this.listeners.delete(listener);
			this.evictions.delete(evict);
			this.failures.delete(failed);
		};
	}
	peek(id: string) {
		return this.entries.get(id)?.data;
	}

	allowBackground() {
		this.ready = true;
		this.pump();
	}

	queue(id: string) {
		if (
			this.lifetime.signal.aborted ||
			this.deleted.has(id) ||
			this.touch(id) ||
			this.flights.has(id)
		)
			return;
		this.queued.add(id);
		this.pump();
	}

	promote(id: string) {
		this.queued = new Set([id, ...this.queued]);
		this.pump();
	}
	cancelQueued(id: string) {
		this.queued.delete(id);
	}

	/** Confirmed deletion, distinct from memory eviction. */
	remove(id: string) {
		if (this.deleted.has(id)) return;
		this.deleted.add(id);
		this.evict(id);
		this.disk.delete(id);
		reconcileCards(id);
		forgetOpening(id);
		for (const listener of this.evictions) listener(id);
	}
	isDeleted(id: string) {
		return this.deleted.has(id);
	}
	rename(id: string, companyName: string) {
		reconcileCards(id, companyName);
		const entry = this.peek(id);
		if (entry)
			this.updateState(id, {
				...entry.contract,
				companyName,
				revision: entry.contract.revision ?? 0,
				lastOperationId: entry.contract.lastOperationId ?? null
			});
	}
	private evict(id: string) {
		const entry = this.entries.get(id);
		if (entry) this.bytes -= entry.bytes;
		this.entries.delete(id);
		this.queued.delete(id);
		this.flights.get(id)?.controller.abort();
		this.flights.delete(id);
	}

	private touch(id: string) {
		const entry = this.entries.get(id);
		if (!entry) return;
		this.entries.delete(id);
		this.entries.set(id, entry);
		return entry.data;
	}

	private enforceLimits() {
		while (this.entries.size > MAX_ENTRIES || this.bytes > MAX_BYTES) {
			const oldest = this.entries.keys().next().value;
			if (oldest === undefined) break;
			this.evict(oldest);
		}
	}

	private remember(id: string, data: ReadyContract) {
		// Serialize immutable snapshot data once; subsequent state updates size only metadata.
		const immutableBytes = JSON.stringify(data.snapshot).length * 2;
		const bytes = immutableBytes + JSON.stringify(data.contract).length * 2;
		const previous = this.entries.get(id);
		if (previous) this.bytes -= previous.bytes;
		this.entries.delete(id);
		if (bytes > MAX_BYTES) return;
		this.entries.set(id, { data, bytes, immutableBytes });
		this.bytes += bytes;
		this.enforceLimits();
	}

	/** Only confirmed server state belongs here. Never inserts a missing entry. */
	updateState(id: string, state: ContractState) {
		const entry = this.entries.get(id);
		if (!entry || this.deleted.has(id)) return;
		const previous = entry.data.contract;
		const revision = previous.revision ?? 0;
		if (state.revision < revision) return entry.data;
		const contract = { ...previous, ...state, lastOperationId: state.lastOperationId ?? undefined };
		if (JSON.stringify(contract) === JSON.stringify(previous)) return entry.data;
		const bytes = entry.immutableBytes + JSON.stringify(contract).length * 2;
		this.bytes += bytes - entry.bytes;
		entry.bytes = bytes;
		entry.data = { ...entry.data, contract };
		this.disk.updateContract(id, contract, () => !this.deleted.has(id));
		this.enforceLimits();
		if (this.entries.get(id) === entry) for (const listener of this.listeners) listener(entry.data);
		return entry.data;
	}

	private fetchFull(id: string, request: typeof fetch) {
		if (this.deleted.has(id)) return Promise.resolve({ id, status: 'missing' } as const);
		if (this.lifetime.signal.aborted) return Promise.resolve({ id, status: 'error' } as const);
		const existing = this.flights.get(id);
		if (existing) return existing.result;
		this.queued.delete(id);
		const controller = new AbortController();
		const signal = AbortSignal.any([this.lifetime.signal, controller.signal]);
		const flight: Flight = {
			controller,
			result: Promise.resolve().then(async () => {
				try {
					signal.throwIfAborted();
					const persisted = await this.disk.get(id);
					signal.throwIfAborted();
					if (this.deleted.has(id)) return { id, status: 'missing' } as const;
					if (!persisted) recordColdStart('contract-snapshot-fetch-start');
					else recordColdStart('contract-disk-cache-hit');
					const result = persisted ?? (await readContract(request, id, signal));
					if (result.status === 'ready' && !validSnapshot(result, id))
						throw new Error('Invalid snapshot');
					signal.throwIfAborted();
					if (this.flights.get(id) === flight && result.status === 'missing') this.remove(id);
					if (this.flights.get(id) === flight && result.status === 'ready') {
						if (this.deleted.has(id)) return { id, status: 'missing' } as const;
						this.remember(id, result);
						if (!persisted) this.disk.put(result, () => !this.deleted.has(id));
						recordColdStart('contract-snapshot-cached');
						for (const listener of this.listeners) listener(this.entries.get(id)?.data ?? result);
					}
					if (result.status === 'error') for (const listener of this.failures) listener(id);
					return result;
				} catch {
					if (!signal.aborted) for (const listener of this.failures) listener(id);
					return { id, status: 'error' } as const;
				} finally {
					if (this.flights.get(id) === flight) this.flights.delete(id);
				}
			})
		};
		this.flights.set(id, flight);
		return flight.result;
	}

	private pump() {
		if (this.lifetime.signal.aborted || !this.ready || document.hidden) return;
		while (this.background < BACKGROUND_CONCURRENCY && this.queued.size) {
			const id = this.queued.values().next().value!;
			this.queued.delete(id);
			if (this.deleted.has(id) || this.entries.has(id) || this.flights.has(id)) continue;
			// All saved contracts share route code. Do not run its loader speculatively.
			this.code ??= preloadCode(`/contracts/${id}`).catch(() => {
				this.code = undefined;
			});
			this.background++;
			void this.fetchFull(id, fetch).finally(() => {
				this.background--;
				this.pump();
			});
		}
	}

	load(id: string, request: typeof fetch = fetch): Promise<ContractRouteData> {
		this.queued.delete(id);
		if (this.deleted.has(id)) return Promise.resolve({ id, status: 'missing' });
		const cached = this.touch(id);
		if (cached) {
			recordColdStart('contract-cache-hit');
			return Promise.resolve(cached);
		}
		recordColdStart('contract-cache-miss');
		return this.fetchFull(id, request);
	}

	destroy() {
		document.removeEventListener('visibilitychange', this.visibility);
		this.listeners.clear();
		this.evictions.clear();
		this.failures.clear();
		this.lifetime.abort();
		this.flights.clear();
		this.entries.clear();
		this.queued.clear();
		this.bytes = 0;
	}
}

let cache: ContractSnapshotCache | undefined;
export function getContractSnapshotCache() {
	if (!browser) throw new Error('Contract snapshot cache is browser-only.');
	return (cache ??= new ContractSnapshotCache());
}

export function releaseContractSnapshotCache() {
	cache?.destroy();
	cache = undefined;
}
