import { baselineBlock } from '../../convex/sourceValidators';
import { playbookItem } from '../../convex/playbookValidators';
import type { ContractRouteData } from './saved';
import { CACHE_NAMESPACE } from './browser-storage';

export type ReadyContract = Extract<ContractRouteData, { status: 'ready' }>;
export const SNAPSHOT_ENTRIES = 24;
export const SNAPSHOT_BYTES = 32 * 1024 * 1024;
type StoredSnapshot = { id: string; snapshot: ReadyContract['snapshot'] };
type StoredMetadata = {
	id: string;
	contract: ReadyContract['contract'];
	bytes: number;
	immutableBytes: number;
	usedAt: number;
};
type Shape = { type: string; value?: unknown };
type Field = { fieldType: Shape; optional: boolean };
function matches(value: unknown, shape: Shape): boolean {
	switch (shape.type) {
		case 'string':
		case 'id':
			return typeof value === 'string';
		case 'number':
			return typeof value === 'number' && Number.isFinite(value);
		case 'boolean':
			return typeof value === 'boolean';
		case 'literal':
			return value === shape.value;
		case 'null':
			return value === null;
		case 'union':
			return (shape.value as Shape[]).some((part) => matches(value, part));
		case 'array':
			return Array.isArray(value) && value.every((part) => matches(part, shape.value as Shape));
		case 'object':
			return (
				!!value &&
				typeof value === 'object' &&
				!Array.isArray(value) &&
				Object.entries(shape.value as Record<string, Field>).every(
					([key, field]) =>
						(field.optional && (value as Record<string, unknown>)[key] === undefined) ||
						matches((value as Record<string, unknown>)[key], field.fieldType)
				)
			);
		default:
			return false;
	}
}
export function validSnapshot(value: unknown, id: string): value is ReadyContract {
	if (!value || typeof value !== 'object') return false;
	const data = value as ReadyContract;
	const contract = data.contract;
	return (
		data.status === 'ready' &&
		data.id === id &&
		!!contract &&
		contract._id === id &&
		typeof contract.companyName === 'string' &&
		Number.isFinite(contract._creationTime) &&
		Number.isFinite(contract.savedAt) &&
		Number.isFinite(contract.blockCount) &&
		Number.isFinite(contract.itemCount) &&
		(contract.lastOperationId === undefined || typeof contract.lastOperationId === 'string') &&
		(contract.revision === undefined || Number.isFinite(contract.revision)) &&
		!!contract.selectedConcessions &&
		typeof contract.selectedConcessions === 'object' &&
		!Array.isArray(contract.selectedConcessions) &&
		Object.values(contract.selectedConcessions).every((choice) => typeof choice === 'string') &&
		!!data.snapshot &&
		Array.isArray(data.snapshot.blocks) &&
		Array.isArray(data.snapshot.items) &&
		contract.blockCount === data.snapshot.blocks.length &&
		contract.itemCount === data.snapshot.items.length &&
		data.snapshot.blocks.every((block) =>
			matches(block, (baselineBlock as unknown as { json: Shape }).json)
		) &&
		data.snapshot.items.every(
			(item) =>
				!!item &&
				typeof item._id === 'string' &&
				Number.isFinite(item._creationTime) &&
				matches(item, (playbookItem as unknown as { json: Shape }).json)
		)
	);
}
function result<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}
function completed(transaction: IDBTransaction) {
	return new Promise<void>((resolve, reject) => {
		transaction.oncomplete = () => resolve();
		transaction.onabort = transaction.onerror = () => reject(transaction.error);
	});
}
/** Independent disk LRU. Immutable content and frequently updated metadata have separate stores. */
export class SnapshotStorage {
	private database: Promise<IDBDatabase | undefined> | undefined;
	private writes: Promise<unknown> = Promise.resolve();
	private open() {
		return (this.database ??= new Promise((resolve) => {
			try {
				const request = indexedDB.open(`${CACHE_NAMESPACE}:snapshots`, 2);
				let settled = false;
				request.onupgradeneeded = () => {
					// The old combined format is an optional cache; rebuild it on demand.
					if (request.result.objectStoreNames.contains('snapshots'))
						request.result.deleteObjectStore('snapshots');
					request.result.createObjectStore('snapshots', { keyPath: 'id' });
					request.result.createObjectStore('metadata', { keyPath: 'id' });
				};
				request.onblocked = request.onerror = () => {
					settled = true;
					resolve(undefined);
				};
				request.onsuccess = () => {
					if (settled) {
						request.result.close();
						return;
					}
					request.result.onversionchange = () => request.result.close();
					resolve(request.result);
				};
			} catch {
				resolve(undefined);
			}
		}));
	}
	async get(id: string): Promise<ReadyContract | undefined> {
		try {
			const db = await this.open();
			if (!db) return;
			const tx = db.transaction(['snapshots', 'metadata'], 'readonly');
			const done = completed(tx);
			done.catch(() => {});
			const [entry, metadata] = await Promise.all([
				result<StoredSnapshot | undefined>(tx.objectStore('snapshots').get(id)),
				result<StoredMetadata | undefined>(tx.objectStore('metadata').get(id))
			]);
			const data =
				entry && metadata
					? { id, status: 'ready' as const, snapshot: entry.snapshot, contract: metadata.contract }
					: undefined;
			const valid =
				data &&
				metadata &&
				Number.isFinite(metadata.bytes) &&
				metadata.bytes >= 0 &&
				metadata.bytes <= SNAPSHOT_BYTES &&
				Number.isFinite(metadata.immutableBytes) &&
				metadata.immutableBytes >= 0 &&
				metadata.immutableBytes <= metadata.bytes &&
				Number.isFinite(metadata.usedAt) &&
				validSnapshot(data, id);
			await done;
			if (!valid) {
				if (entry || metadata) this.delete(id);
				return;
			}
			this.touch(id);
			return data;
		} catch {
			return;
		}
	}
	private enqueue(write: () => Promise<void>) {
		this.writes = this.writes.then(write).catch(() => {});
	}
	private touch(id: string) {
		this.enqueue(async () => {
			const db = await this.open();
			if (!db) return;
			const tx = db.transaction('metadata', 'readwrite');
			const done = completed(tx);
			done.catch(() => {});
			const store = tx.objectStore('metadata');
			const metadata = await result<StoredMetadata | undefined>(store.get(id));
			if (metadata) store.put({ ...metadata, usedAt: Date.now() });
			await done;
		});
	}
	private async enforceLimits(tx: IDBTransaction) {
		const store = tx.objectStore('metadata');
		const entries = await result<StoredMetadata[]>(store.getAll());
		let total = entries.reduce((sum, entry) => sum + entry.bytes, 0);
		let count = entries.length;
		for (const entry of entries.sort((a, b) => a.usedAt - b.usedAt)) {
			if (count <= SNAPSHOT_ENTRIES && total <= SNAPSHOT_BYTES) break;
			store.delete(entry.id);
			tx.objectStore('snapshots').delete(entry.id);
			total -= entry.bytes;
			count--;
		}
	}
	put(data: ReadyContract, valid: () => boolean) {
		this.enqueue(async () => {
			const db = await this.open();
			if (!db || !valid()) return;
			const immutableBytes = JSON.stringify(data.snapshot).length * 2;
			const bytes = immutableBytes + JSON.stringify(data.contract).length * 2;
			if (bytes > SNAPSHOT_BYTES) return;
			const tx = db.transaction(['snapshots', 'metadata'], 'readwrite');
			const done = completed(tx);
			done.catch(() => {});
			tx.objectStore('snapshots').put({ id: data.id, snapshot: data.snapshot });
			tx.objectStore('metadata').put({
				id: data.id,
				contract: data.contract,
				bytes,
				immutableBytes,
				usedAt: Date.now()
			});
			await this.enforceLimits(tx);
			await done;
		});
	}
	updateContract(id: string, contract: ReadyContract['contract'], valid: () => boolean) {
		this.enqueue(async () => {
			const db = await this.open();
			if (!db || !valid()) return;
			const tx = db.transaction(['snapshots', 'metadata'], 'readwrite');
			const done = completed(tx);
			done.catch(() => {});
			const store = tx.objectStore('metadata');
			const metadata = await result<StoredMetadata | undefined>(store.get(id));
			if (metadata && valid()) {
				const bytes = metadata.immutableBytes + JSON.stringify(contract).length * 2;
				store.put({ ...metadata, contract, bytes, usedAt: Date.now() });
				await this.enforceLimits(tx);
			}
			await done;
		});
	}
	delete(id: string) {
		this.enqueue(async () => {
			const db = await this.open();
			if (!db) return;
			const tx = db.transaction(['snapshots', 'metadata'], 'readwrite');
			const done = completed(tx);
			done.catch(() => {});
			tx.objectStore('snapshots').delete(id);
			tx.objectStore('metadata').delete(id);
			await done;
		});
	}
}
