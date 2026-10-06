import { sameSelection } from '$lib/playbook/model';
import {
	saveError,
	type ContractSaveResult,
	type ContractState,
	type SavedSelections
} from './saved';
import type { Id } from '../../convex/_generated/dataModel';

export type ContractSaveRequest = {
	id: Id<'savedContracts'>;
	selectedConcessions: SavedSelections;
	expectedRevision: number;
	operationId: string;
};

/** Owns persistence only. Document rendering never initiates a save. */
export class ContractPersistence {
	confirmed: ContractState;
	choices = $state.raw<SavedSelections>({});
	request = $state.raw<ContractSaveRequest | null>(null);
	error = $state<string | null>(null);
	conflict = $state(false);
	deleted = $state(false);
	private running: Promise<void> | null = null;
	private active = true;
	private paused = false;

	constructor(
		private id: Id<'savedContracts'>,
		initial: ContractState,
		private save: (request: ContractSaveRequest) => Promise<ContractSaveResult>
	) {
		this.confirmed = $state.raw(initial);
		this.choices = { ...initial.selectedConcessions };
	}

	get pending() {
		return (
			Boolean(this.request) || !sameSelection(this.choices, this.confirmed.selectedConcessions)
		);
	}
	get editable() {
		return this.active && !this.paused && !this.conflict && !this.deleted;
	}

	select(itemId: Id<'playbookItems'>, concessionId: string | null) {
		if (!this.editable) return;
		const next = { ...this.choices };
		if (concessionId === null || next[itemId] === concessionId) delete next[itemId];
		else next[itemId] = concessionId;
		if (sameSelection(next, this.choices)) return;
		this.choices = next;
		this.start();
	}

	accept(next: ContractState | null) {
		if (!this.active || this.deleted) return;
		if (next === null) {
			this.deleted = true;
			return;
		}
		if (next.revision < this.confirmed.revision) return;
		const pending = this.pending;
		const own = Boolean(this.request && next.lastOperationId === this.request.operationId);
		if (next.revision > this.confirmed.revision && pending && !own) this.conflict = true;
		this.confirmed = next;
		if (!pending && !this.conflict) this.choices = { ...next.selectedConcessions };
		// A subscription can confirm an ambiguous failed response. Do not send a duplicate.
		if (own && !this.running && !this.conflict) {
			this.request = null;
			this.error = null;
			this.start();
		}
	}

	private start() {
		if (!this.editable || this.running || this.error) return;
		if (!this.request) {
			if (!this.pending) return;
			this.request = {
				id: this.id,
				selectedConcessions: { ...this.choices },
				expectedRevision: this.confirmed.revision,
				operationId: crypto.randomUUID()
			};
		}
		const request = this.request;
		// Keep exactly one immutable operation until it is acknowledged or explicitly discarded.
		this.running = this.send(request);
	}

	private async send(request: ContractSaveRequest) {
		// Yield so `running` is assigned even if the transport throws synchronously.
		await Promise.resolve();
		try {
			const result = await this.save(request);
			if (!this.active) return;
			if (result.status === 'deleted') this.deleted = true;
			else {
				// A subscription may already include a later rename at the same revision.
				if (result.state.revision > this.confirmed.revision) this.accept(result.state);
				if (result.status === 'conflict') this.conflict = true;
			}
			this.request = null;
		} catch (cause) {
			if (!this.active) return;
			if (this.confirmed.lastOperationId === request.operationId) this.request = null;
			else
				this.error = saveError(
					cause,
					'We couldn’t save this contract. Your changes are still here.'
				);
		} finally {
			this.running = null;
			if (this.active) this.start();
		}
	}

	retry() {
		if (!this.editable || this.running) return;
		this.error = null;
		this.start();
	}

	async loadLatest() {
		// A request already handed to Convex cannot be cancelled. Wait for its outcome
		// before discarding intent so a late acknowledgement cannot start another save.
		if (this.running) await this.running;
		if (!this.active || this.deleted) return;
		this.request = null;
		this.error = null;
		this.conflict = false;
		this.choices = { ...this.confirmed.selectedConcessions };
	}

	pause() {
		this.paused = true;
	}

	resume() {
		this.paused = false;
		this.start();
	}

	async flush() {
		while (this.active && !this.deleted && !this.conflict && !this.error && this.pending) {
			this.start();
			if (!this.running) return false;
			await this.running;
		}
		return this.active && !this.deleted && !this.conflict && !this.error && !this.pending;
	}

	destroy() {
		this.active = false;
	}
}
