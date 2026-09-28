import type { OptimisticLocalStore } from 'convex/browser';
import { useMutation } from 'convex-svelte';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import type { ClauseBoxRecord, EditableCopyKey } from '$lib/contract/model';

type EditField = EditableCopyKey | 'tooltip';
type EditFeedback = {
	kind: 'save-failed' | 'conflict';
	id: Id<'clauseBoxes'>;
	field: EditField;
	clauseKey: string;
};
type Notice =
	| {
			kind:
				| 'removed'
				| 'delete-failed'
				| 'delete-unconfirmed'
				| 'delete-already-missing'
				| 'undo-unavailable';
			id: Id<'clauseBoxes'>;
			clauseKey: string;
	  }
	| {
			kind: 'undo-conflict' | 'undo-removed' | 'undo-failed';
			id: Id<'clauseBoxes'>;
			field: EditField;
			clauseKey: string;
	  }
	| {
			kind: 'undo-restore-conflict' | 'undo-restore-failed' | 'undo-restore-unavailable';
			id: Id<'clauseBoxes'>;
			clauseKey: string;
	  };
export type UndoState = { pending: boolean };
export type PersistenceFeedback =
	| EditFeedback
	| Notice
	| { kind: 'saving' | 'deleting' | 'saved' | 'deleted' | 'undoing' | 'undone' };
type JobBase = {
	id: Id<'clauseBoxes'>;
	clauseKey: string;
	version: number;
	action: number;
	inFlight: boolean;
	issue?: 'failed' | 'conflict';
	issueOrder?: number;
	timer?: ReturnType<typeof setTimeout>;
};
type CopyJob = JobBase & {
	kind: 'copy';
	field: EditableCopyKey;
	value: string;
	expectedValue: string;
	serverValue?: string;
};
type TooltipJob = JobBase & {
	kind: 'tooltip';
	field: 'tooltip';
	value: boolean;
	expectedValue: boolean;
	serverValue?: boolean;
};
type Job = CopyJob | TooltipJob;
type SaveInput =
	| Pick<CopyJob, 'kind' | 'id' | 'field' | 'value' | 'expectedValue'>
	| Pick<TooltipJob, 'kind' | 'id' | 'value' | 'expectedValue'>;
type UndoRecord =
	| {
			kind: 'copy';
			id: Id<'clauseBoxes'>;
			clauseKey: string;
			field: EditableCopyKey;
			before: string;
			after: string;
	  }
	| {
			kind: 'tooltip';
			id: Id<'clauseBoxes'>;
			clauseKey: string;
			field: 'tooltip';
			before: boolean;
			after: boolean;
	  }
	| {
			kind: 'delete';
			id: Id<'clauseBoxes'>;
			clauseKey: string;
			undoToken: string;
	  };
type SaveResult<T> =
	| { status: 'updated'; currentValue: T }
	| { status: 'unchanged' | 'conflict'; currentValue: T }
	| { status: 'missing' };

/** One local draft and one ordered save job per field. The mutation result acknowledges each write. */
export class AdminPersistence {
	drafts = $state<Record<string, Partial<Record<EditableCopyKey, string>>>>({});
	tooltipOverrides = $state<Record<string, boolean>>({});
	feedback = $state<PersistenceFeedback | null>(null);
	undo = $state<UndoState | null>(null);
	deletingIds = $state.raw<ReadonlySet<Id<'clauseBoxes'>>>(new Set());
	#deleted = new Set<Id<'clauseBoxes'>>();
	#uncertainDeletes = new Map<
		Id<'clauseBoxes'>,
		{ undoToken: string; clauseKey: string; action: number; checking: boolean }
	>();
	#undoRecord: UndoRecord | null = null;
	#editSequence = 0;
	#jobs = new Map<string, Job>();
	#boxes: ClauseBoxRecord[] = [];
	#notices = new Map<Id<'clauseBoxes'>, { notice: Notice; order: number }>();
	#issueOrder = 0;
	#success: 'saved' | 'deleted' | 'undone' | null = null;
	#successTimer?: ReturnType<typeof setTimeout>;
	#saveCopy = useMutation(api.admin.saveCopy);
	#saveTooltip = useMutation(api.admin.saveTooltip);
	#deleteBox = useMutation(api.admin.deleteBox);
	#restoreBox = useMutation(api.admin.restoreBox);

	get hasUnsavedChanges() {
		return this.#jobs.size > 0 || this.deletingIds.size > 0 || Boolean(this.undo?.pending);
	}
	isDeleting(id: Id<'clauseBoxes'>) {
		return this.deletingIds.has(id) || this.#deleted.has(id);
	}
	#key(id: string, field: EditField) {
		return `${id}:${field}`;
	}
	#clearSuccess() {
		clearTimeout(this.#successTimer);
		this.#success = null;
	}
	#recordNotice(notice: Notice) {
		this.#clearSuccess();
		this.#notices.delete(notice.id);
		this.#notices.set(notice.id, { notice, order: ++this.#issueOrder });
	}
	#refresh() {
		const jobs = [...this.#jobs.values()].filter((job) => !this.deletingIds.has(job.id));
		const issue = jobs.reduce<Job | undefined>(
			(latest, job) =>
				job.issue && (!latest || (job.issueOrder ?? 0) > (latest.issueOrder ?? 0)) ? job : latest,
			undefined
		);
		const latestNotice = [...this.#notices.values()].at(-1);
		if (issue && (!latestNotice || (issue.issueOrder ?? 0) > latestNotice.order)) {
			this.feedback = {
				kind: issue.issue === 'conflict' ? 'conflict' : 'save-failed',
				id: issue.id,
				field: issue.field,
				clauseKey: issue.clauseKey
			};
		} else if (latestNotice) this.feedback = latestNotice.notice;
		else if (this.deletingIds.size) this.feedback = { kind: 'deleting' };
		else if (this.undo?.pending) this.feedback = { kind: 'undoing' };
		else if (jobs.length) this.feedback = { kind: 'saving' };
		else this.feedback = this.#success ? { kind: this.#success } : null;
	}

	#announce(kind: 'saved' | 'deleted' | 'undone') {
		clearTimeout(this.#successTimer);
		this.#success = kind;
		this.#successTimer = setTimeout(() => {
			this.#success = null;
			this.#refresh();
		}, 2000);
		this.#refresh();
	}
	#clearField(key: string, job: Job) {
		if (this.#jobs.get(key) !== job) return;
		clearTimeout(job.timer);
		this.#jobs.delete(key);
		if (job.kind === 'tooltip') delete this.tooltipOverrides[job.id];
		else {
			const fields = this.drafts[job.id];
			if (fields) {
				delete fields[job.field];
				if (!Object.keys(fields).length) delete this.drafts[job.id];
			}
		}
	}
	#clearBox(id: Id<'clauseBoxes'>) {
		for (const [key, job] of this.#jobs) if (job.id === id) this.#clearField(key, job);
		delete this.drafts[id];
		delete this.tooltipOverrides[id];
	}
	#markDeleted(id: Id<'clauseBoxes'>) {
		this.#deleted.add(id);
		this.#clearBox(id);
		this.#notices.delete(id);
		if (this.#undoRecord?.id === id && this.#undoRecord.kind !== 'delete') this.#invalidateUndo();
	}
	#optimisticField(
		store: OptimisticLocalStore,
		id: Id<'clauseBoxes'>,
		field: EditableCopyKey | 'showPreferredConcessionsInfoTooltip',
		expectedValue: string | boolean,
		value: string | boolean
	) {
		const boxes = store.getQuery(api.clauseBoxes.list, {});
		if (!boxes?.some((box) => box.id === id && box[field] === expectedValue)) return;
		store.setQuery(
			api.clauseBoxes.list,
			{},
			boxes.map((box) => (box.id === id ? { ...box, [field]: value } : box))
		);
	}
	#saveField(input: SaveInput): Promise<SaveResult<string> | SaveResult<boolean>> {
		if (input.kind === 'copy') {
			const { id, field, value, expectedValue } = input;
			return this.#saveCopy(
				{ id, section: field, value, expectedValue },
				{
					optimisticUpdate: (store) => this.#optimisticField(store, id, field, expectedValue, value)
				}
			);
		}
		const { id, value, expectedValue } = input;
		return this.#saveTooltip(
			{ id, enabled: value, expectedValue },
			{
				optimisticUpdate: (store) =>
					this.#optimisticField(
						store,
						id,
						'showPreferredConcessionsInfoTooltip',
						expectedValue,
						value
					)
			}
		);
	}
	#invalidateUndo() {
		const id = this.#undoRecord?.id;
		if (
			id &&
			['undo-failed', 'undo-restore-failed'].includes(this.#notices.get(id)?.notice.kind ?? '')
		)
			this.#notices.delete(id);
		this.#undoRecord = null;
		this.undo = null;
	}
	#beginEdit(id: Id<'clauseBoxes'>) {
		this.#invalidateUndo();
		this.#uncertainDeletes.clear();
		if (this.#notices.get(id)?.notice.kind === 'undo-conflict') this.#notices.delete(id);
		return ++this.#editSequence;
	}
	#queue(key: string, job: Job, delay: number) {
		this.#clearSuccess();
		job.version++;
		clearTimeout(job.timer);
		job.timer = undefined;
		if (job.issue === 'conflict') {
			if (job.value === job.serverValue) this.#clearField(key, job);
			this.#refresh();
			return;
		}
		if (!job.inFlight && job.value === job.expectedValue) {
			this.#clearField(key, job);
			this.#refresh();
			return;
		}
		job.issue = undefined;
		if (delay) {
			job.timer = setTimeout(() => {
				job.timer = undefined;
				void this.#send(key, job);
			}, delay);
		} else void this.#send(key, job);
		this.#refresh();
	}
	updateCopy(id: Id<'clauseBoxes'>, field: EditableCopyKey, value: string) {
		if (this.isDeleting(id) || this.undo?.pending) return;
		const key = this.#key(id, field);
		const existing = this.#jobs.get(key);
		if (existing?.kind === 'copy') {
			existing.action = this.#beginEdit(id);
			existing.value = value;
			(this.drafts[id] ??= {})[field] = value;
			this.#queue(key, existing, 550);
			return;
		}
		const box = this.#boxes.find((item) => item.id === id);
		if (!box) return;
		const action = this.#beginEdit(id);
		const job: CopyJob = {
			kind: 'copy',
			id,
			clauseKey: box.clauseKey,
			field,
			value,
			expectedValue: box[field],
			version: 0,
			action,
			inFlight: false
		};
		this.#jobs.set(key, job);
		(this.drafts[id] ??= {})[field] = value;
		this.#queue(key, job, 550);
	}
	blurCopy(id: Id<'clauseBoxes'>, field: EditableCopyKey) {
		this.#flush(this.#key(id, field));
	}
	updateTooltip(id: Id<'clauseBoxes'>, enabled: boolean) {
		if (this.isDeleting(id) || this.undo?.pending) return;
		const key = this.#key(id, 'tooltip');
		const existing = this.#jobs.get(key);
		if (existing?.kind === 'tooltip') {
			existing.action = this.#beginEdit(id);
			existing.value = enabled;
			this.tooltipOverrides[id] = enabled;
			this.#queue(key, existing, 0);
			return;
		}
		const box = this.#boxes.find((item) => item.id === id);
		if (!box) return;
		const action = this.#beginEdit(id);
		const job: TooltipJob = {
			kind: 'tooltip',
			id,
			clauseKey: box.clauseKey,
			field: 'tooltip',
			value: enabled,
			expectedValue: box.showPreferredConcessionsInfoTooltip,
			version: 0,
			action,
			inFlight: false
		};
		this.#jobs.set(key, job);
		this.tooltipOverrides[id] = enabled;
		this.#queue(key, job, 0);
	}
	async #send(key: string, job: Job) {
		if (this.#jobs.get(key) !== job || job.inFlight || job.issue || this.isDeleting(job.id)) return;
		const version = job.version;
		const action = job.action;
		const before = job.expectedValue;
		job.inFlight = true;
		this.#refresh();
		try {
			const result = await this.#saveField(job);
			if (this.#jobs.get(key) !== job) return;
			job.inFlight = false;
			if (result.status === 'missing') {
				this.#markDeleted(job.id);
				if (!this.deletingIds.has(job.id))
					this.#recordNotice({ kind: 'removed', id: job.id, clauseKey: job.clauseKey });
				this.#refresh();
				return;
			}
			if (result.status === 'conflict') {
				this.#clearSuccess();
				if (job.value === result.currentValue) this.#clearField(key, job);
				else {
					job.issue = 'conflict';
					job.issueOrder = ++this.#issueOrder;
					if (job.kind === 'copy' && typeof result.currentValue === 'string')
						job.serverValue = result.currentValue;
					else if (job.kind === 'tooltip' && typeof result.currentValue === 'boolean')
						job.serverValue = result.currentValue;
				}
				this.#refresh();
				return;
			}
			if (job.kind === 'copy' && typeof result.currentValue === 'string')
				job.expectedValue = result.currentValue;
			else if (job.kind === 'tooltip' && typeof result.currentValue === 'boolean')
				job.expectedValue = result.currentValue;
			if (
				result.status === 'updated' &&
				action === this.#editSequence &&
				job.version === version &&
				job.value === result.currentValue &&
				!this.isDeleting(job.id)
			) {
				const record: UndoRecord =
					job.kind === 'copy'
						? {
								kind: 'copy',
								id: job.id,
								clauseKey: job.clauseKey,
								field: job.field,
								before: before as string,
								after: result.currentValue as string
							}
						: {
								kind: 'tooltip',
								id: job.id,
								clauseKey: job.clauseKey,
								field: 'tooltip',
								before: before as boolean,
								after: result.currentValue as boolean
							};
				this.#undoRecord = record;
				this.undo = { pending: false };
			}
			if (job.version !== version && job.value !== job.expectedValue) {
				if (!job.timer) void this.#send(key, job);
			} else this.#clearField(key, job);
			if (!this.deletingIds.has(job.id)) this.#announce('saved');
		} catch (error) {
			if (this.#jobs.get(key) !== job) return;
			job.inFlight = false;
			job.issue = 'failed';
			job.issueOrder = ++this.#issueOrder;
			this.#clearSuccess();
			console.error('Admin save failed.', error);
			this.#refresh();
		}
	}
	#flush(key: string) {
		const job = this.#jobs.get(key);
		if (!job?.timer) return;
		clearTimeout(job.timer);
		job.timer = undefined;
		void this.#send(key, job);
	}
	flushPending() {
		for (const key of this.#jobs.keys()) this.#flush(key);
	}
	closeEditors() {
		this.flushPending();
	}
	retry(id: Id<'clauseBoxes'>, field: EditField) {
		const key = this.#key(id, field);
		const job = this.#jobs.get(key);
		if (job?.issue === 'failed' && !this.isDeleting(id)) {
			job.issue = undefined;
			void this.#send(key, job);
		}
		this.#refresh();
	}
	discardConflict(id: Id<'clauseBoxes'>, field: EditField) {
		const key = this.#key(id, field);
		const job = this.#jobs.get(key);
		if (job?.issue === 'conflict') this.#clearField(key, job);
		this.#refresh();
	}
	dismissNotice(id: Id<'clauseBoxes'>) {
		this.#notices.delete(id);
		this.#refresh();
	}
	async undoEdit() {
		const record = this.#undoRecord;
		if (
			!record ||
			!this.undo ||
			this.undo.pending ||
			this.deletingIds.has(record.id) ||
			(record.kind !== 'delete' && this.isDeleting(record.id))
		)
			return;
		this.#clearSuccess();
		if (
			['undo-failed', 'undo-restore-failed'].includes(
				this.#notices.get(record.id)?.notice.kind ?? ''
			)
		)
			this.#notices.delete(record.id);
		this.undo = { pending: true };
		this.#refresh();
		try {
			if (record.kind === 'delete') {
				const result = await this.#restoreBox({ id: record.id, undoToken: record.undoToken });
				if (this.#undoRecord !== record) return;
				this.#invalidateUndo();
				if (result.status === 'conflict') {
					this.#recordNotice({
						kind: 'undo-restore-conflict',
						id: record.id,
						clauseKey: record.clauseKey
					});
					this.#refresh();
				} else if (result.status === 'missing') {
					this.#recordNotice({
						kind: 'undo-restore-unavailable',
						id: record.id,
						clauseKey: record.clauseKey
					});
					this.#refresh();
				} else this.#announce('undone');
				return;
			}
			const result = await this.#saveField(
				record.kind === 'copy'
					? {
							kind: 'copy',
							id: record.id,
							field: record.field,
							value: record.before,
							expectedValue: record.after
						}
					: {
							kind: 'tooltip',
							id: record.id,
							value: record.before,
							expectedValue: record.after
						}
			);
			if (this.#undoRecord !== record) return;
			this.#invalidateUndo();
			if (result.status === 'missing') {
				this.#markDeleted(record.id);
				this.#recordNotice({
					kind: 'undo-removed',
					id: record.id,
					field: record.field,
					clauseKey: record.clauseKey
				});
			} else if (result.status === 'conflict')
				this.#recordNotice({
					kind: 'undo-conflict',
					id: record.id,
					field: record.field,
					clauseKey: record.clauseKey
				});
			else {
				this.#announce('undone');
				return;
			}
			this.#refresh();
		} catch (error) {
			if (this.#undoRecord !== record) return;
			console.error('Admin undo failed.', error);
			this.undo = { pending: false };
			this.#recordNotice(
				record.kind === 'delete'
					? { kind: 'undo-restore-failed', id: record.id, clauseKey: record.clauseKey }
					: { kind: 'undo-failed', id: record.id, field: record.field, clauseKey: record.clauseKey }
			);
			this.#refresh();
		}
	}
	async deleteBox(id: Id<'clauseBoxes'>) {
		if (this.isDeleting(id) || this.undo?.pending) return false;
		this.#clearSuccess();
		const clauseKey = this.#boxes.find((box) => box.id === id)?.clauseKey ?? '';
		this.#invalidateUndo();
		const action = ++this.#editSequence;
		this.#uncertainDeletes.clear();
		const undoToken = crypto.randomUUID();
		this.deletingIds = new Set([...this.deletingIds, id]);
		this.#refresh();
		try {
			const result = await this.#deleteBox({ id, undoToken });
			this.#markDeleted(id);
			this.deletingIds = new Set([...this.deletingIds].filter((item) => item !== id));
			if (result.status === 'deleted') {
				this.#rememberDeletedBox(id, result.clauseKey, undoToken, action);
				this.#announce('deleted');
			} else {
				this.#recordNotice({ kind: 'delete-already-missing', id, clauseKey });
				this.#refresh();
			}
			return true;
		} catch (error) {
			console.error('Clause box deletion failed.', error);
			this.deletingIds = new Set([...this.deletingIds].filter((item) => item !== id));
			if (action === this.#editSequence)
				this.#uncertainDeletes.set(id, { undoToken, clauseKey, action, checking: false });
			if (this.#deleted.has(id) || !this.#boxes.some((box) => box.id === id)) {
				this.#markDeleted(id);
				this.#recordNotice({ kind: 'delete-unconfirmed', id, clauseKey });
				void this.#verifyDeletedBox(id);
				return true;
			}
			this.#recordNotice({ kind: 'delete-failed', id, clauseKey });
			for (const [key, job] of this.#jobs)
				if (job.id === id && !job.inFlight && !job.issue && !job.timer) {
					if (job.value === job.expectedValue) this.#clearField(key, job);
					else void this.#send(key, job);
				}
			this.#refresh();
			return false;
		}
	}
	#rememberDeletedBox(id: Id<'clauseBoxes'>, clauseKey: string, undoToken: string, action: number) {
		if (action === this.#editSequence) {
			this.#undoRecord = { kind: 'delete', id, clauseKey, undoToken };
			this.undo = { pending: false };
		}
	}
	async #verifyDeletedBox(id: Id<'clauseBoxes'>) {
		const attempt = this.#uncertainDeletes.get(id);
		if (
			!attempt ||
			attempt.checking ||
			(this.#boxes.some((box) => box.id === id) && !this.#deleted.has(id))
		)
			return;
		attempt.checking = true;
		try {
			const result = await this.#deleteBox({ id, undoToken: attempt.undoToken });
			if (this.#uncertainDeletes.get(id) !== attempt) return;
			this.#uncertainDeletes.delete(id);
			this.#markDeleted(id);
			if (result.status === 'deleted') {
				this.#rememberDeletedBox(id, result.clauseKey, attempt.undoToken, attempt.action);
				this.#announce('deleted');
			} else {
				this.#recordNotice({ kind: 'delete-already-missing', id, clauseKey: attempt.clauseKey });
				this.#refresh();
			}
		} catch (error) {
			if (this.#uncertainDeletes.get(id) !== attempt) return;
			attempt.checking = false;
			console.error('Could not verify clause box deletion.', error);
			this.#recordNotice({ kind: 'delete-unconfirmed', id, clauseKey: attempt.clauseKey });
			this.#refresh();
		}
	}
	retryUncertainDeletes() {
		for (const id of this.#uncertainDeletes.keys()) void this.#verifyDeletedBox(id);
	}
	reconcile(boxes: ClauseBoxRecord[]) {
		this.#boxes = boxes;
		const ids = new Set(boxes.map((box) => box.id));
		let changed = false;
		const record = this.#undoRecord;
		if (
			record &&
			record.kind !== 'delete' &&
			!ids.has(record.id) &&
			!this.deletingIds.has(record.id)
		) {
			this.#markDeleted(record.id);
			this.#recordNotice({ kind: 'undo-unavailable', id: record.id, clauseKey: record.clauseKey });
			changed = true;
		}
		for (const [id, attempt] of this.#uncertainDeletes)
			if (!ids.has(id)) {
				this.#markDeleted(id);
				if (!attempt.checking) {
					this.#recordNotice({ kind: 'delete-unconfirmed', id, clauseKey: attempt.clauseKey });
					void this.#verifyDeletedBox(id);
				}
				changed = true;
			}
		for (const { notice } of this.#notices.values())
			if (notice.kind === 'delete-failed' && !ids.has(notice.id)) {
				this.#markDeleted(notice.id);
				this.#announce('deleted');
				changed = true;
			}
		for (const [key, job] of this.#jobs) {
			const box = boxes.find((item) => item.id === job.id);
			if (box && job.issue === 'conflict') {
				const serverValue =
					job.kind === 'tooltip' ? box.showPreferredConcessionsInfoTooltip : box[job.field];
				if (job.value === serverValue) {
					this.#clearField(key, job);
					changed = true;
					continue;
				}
				if (job.kind === 'copy' && typeof serverValue === 'string') job.serverValue = serverValue;
				else if (job.kind === 'tooltip' && typeof serverValue === 'boolean')
					job.serverValue = serverValue;
			}
			if (ids.has(job.id) || this.deletingIds.has(job.id) || this.#deleted.has(job.id)) continue;
			this.#markDeleted(job.id);
			this.#recordNotice({ kind: 'removed', id: job.id, clauseKey: job.clauseKey });
			changed = true;
		}
		if (changed) this.#refresh();
	}
}
