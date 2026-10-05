import { documentAnnotations, triggerAnnotationId } from './document-overlay';
import { untrack } from 'svelte';
import type { PlaybookGeometryIndex } from './geometry-index';
import type { SourceIndex } from '../contract/source-index';
import {
	newConcessionId,
	type Concession,
	type PlaybookItemRecord,
	type SourceRange
} from './model';
import { newPlaybookDraft } from './draft';
import type { AuthoringSession } from './authoring.svelte';
import {
	evaluateInitialSelection,
	evaluateSecondarySelection,
	evaluateConcessionAddition,
	selectionIssueMessage,
	type AuthoringMode,
	type SelectionIssue,
	type SelectionEligibility
} from './source-picking';

type Source = {
	geometry: PlaybookGeometryIndex | null;
	index: SourceIndex | null;
	items: readonly PlaybookItemRecord[] | null;
	available: boolean;
};

/** Workspace workflow; the session remains the sole owner of persistence. */
export class AuthoringFlow {
	step = $state<'concession' | 'other-part'>('concession');
	affectsOtherParts = $state(false);
	selectedTriggerId = $state<string | null>(null);
	selectedAnnotationId = $state<string | null>(null);
	initialSelection = $state<SourceRange | null>(null);
	/** The last locally added concession stays visible until this workflow ends. */
	previewConcessionId = $state<string | null>(null);
	issue = $state<SelectionIssue | null>(null);
	editError = $state('');
	pendingAddition = $state<{
		key: string;
		triggerId: string;
		concession: Concession;
	} | null>(null);
	constructor(
		readonly session: AuthoringSession,
		private source: () => Source
	) {
		$effect(() => {
			const items = this.source().items;
			const item = items?.find((item) => item._id === this.draft?.persistedId);
			if (this.entry?.confirmed && !this.pendingAddition) this.initialSelection = null;
			const selected = this.selectedAnnotationId;
			if (
				selected &&
				(!item || !documentAnnotations(item).some((annotation) => annotation.id === selected))
			) {
				this.selectedAnnotationId = null;
				this.selectedTriggerId = item?.triggers[0]?.id ?? null;
			}
			if (item && !item.triggers.some((trigger) => trigger.id === this.selectedTriggerId))
				this.selectedTriggerId = item.triggers[0]?.id ?? null;
		});
		// Acknowledged saves and explicit cancellation end the visible workflow.
		$effect(() => {
			const key = session.active?.key ?? null;
			untrack(() => {
				if (key !== this.workflowKey) this.reset();
			});
		});
	}
	private workflowKey: string | null = null;
	get entry() {
		return this.session.active;
	}
	get draft() {
		return this.entry?.draft ?? null;
	}
	get creating() {
		return this.addingConcession || Boolean(this.entry && !this.entry.confirmed);
	}
	get addingConcession() {
		return Boolean(this.pendingAddition);
	}
	get canCancel() {
		return this.session.canCancel;
	}
	get hasUnsavedWork() {
		return this.session.hasUnsavedWork || this.addingConcession;
	}
	get stagedCreation() {
		return this.creating && Boolean(this.creationConcession);
	}
	get creationConcession() {
		return (
			this.pendingAddition?.concession ??
			(this.entry && !this.entry.confirmed ? this.draft?.concessions[0] : undefined)
		);
	}
	get additionTargetReason() {
		const pending = this.pendingAddition;
		if (!pending) return '';
		if (this.entry?.key !== pending.key) return 'This instruction box is no longer available';
		const reason = this.session.updateTargetReadiness(pending.key);
		if (reason) return reason;
		const draft = this.entry.draft;
		const range = draft.triggers.find((trigger) => trigger.id === pending.triggerId)?.range;
		const captured = pending.concession.changes[0].range;
		if (
			!range ||
			range.start.sourceKey !== captured.start.sourceKey ||
			range.start.offset !== captured.start.offset ||
			range.end.sourceKey !== captured.end.sourceKey ||
			range.end.offset !== captured.end.offset
		)
			return 'This instruction box or its selected text changed. Cancel and start the addition again.';
		return '';
	}
	get secondarySelection() {
		return this.creationConcession?.changes[1]?.range;
	}
	get otherClauseActive() {
		return this.stagedCreation && this.step === 'other-part';
	}
	get picking() {
		return (
			this.otherClauseActive &&
			this.canCancel &&
			!this.additionTargetReason &&
			!this.secondarySelection
		);
	}
	get selectionMode(): 'inactive' | 'create' | 'secondary' {
		return !this.source().available || Boolean(this.additionTargetReason)
			? 'inactive'
			: this.picking
				? 'secondary'
				: this.draft
					? 'inactive'
					: 'create';
	}
	selectedRanges = $derived(
		[this.initialSelection, this.secondarySelection].filter((range): range is SourceRange =>
			Boolean(range)
		)
	);
	get feedback() {
		return this.additionTargetReason || (this.issue ? selectionIssueMessage(this.issue) : '');
	}
	get lastStep() {
		return this.step === 'other-part' || !this.affectsOtherParts;
	}
	get canBack() {
		return this.canCancel && this.stagedCreation && this.step === 'other-part';
	}
	get readinessReason() {
		const targetReason = this.additionTargetReason;
		if (targetReason) return targetReason;
		if (!this.session.canEdit) return this.session.statusMessage;
		if (this.otherClauseActive && !this.secondarySelection)
			return 'Select the other clause of the contract';
		if (this.pendingAddition)
			return this.session.additionReadiness(
				this.pendingAddition.key,
				this.pendingAddition.concession
			);
		return this.session.rejectionReason || this.session.validation.reason;
	}
	clearFeedback() {
		this.issue = null;
		this.editError = '';
	}
	reportIssue(issue: SelectionIssue | null) {
		this.issue = issue;
	}
	private reset() {
		this.workflowKey = this.session.active?.key ?? null;
		this.previewConcessionId = null;
		this.pendingAddition = null;
		this.step = 'concession';
		this.affectsOtherParts = Boolean(this.creationConcession?.changes[1]);
		this.initialSelection = null;
		this.selectedTriggerId = this.draft?.triggers[0]?.id ?? null;
		this.selectedAnnotationId =
			this.draft?.persistedId && this.selectedTriggerId
				? triggerAnnotationId(this.draft.persistedId, this.selectedTriggerId)
				: null;
		this.clearFeedback();
	}
	selectionEligibility(range: SourceRange): SelectionEligibility {
		if (this.additionTargetReason) return { allowed: false, issue: { kind: 'unavailable' } };
		const { index, items, available, geometry } = this.source();
		if (!available || !index || !items || !geometry)
			return { allowed: false, issue: { kind: 'unavailable' } };
		return this.picking && this.draft
			? evaluateSecondarySelection(index, range, this.draft, geometry, this.creationConcession)
			: evaluateInitialSelection(index, range, geometry);
	}
	acceptSelection(range: SourceRange, mode?: AuthoringMode) {
		if (this.additionTargetReason) return false;
		const requestedMode = mode ?? (this.picking ? 'concession' : 'explain');
		if (this.draft && !this.picking) return false;
		// Revalidate against the latest source and live items immediately before mutation.
		const permission = this.selectionEligibility(range);
		if (!permission.allowed) {
			this.reportIssue(permission.issue);
			return false;
		}
		if (!permission.modes.includes(requestedMode)) {
			this.reportIssue(
				permission.concessionIssue ?? {
					kind: 'unexpected',
					diagnostic: new Error('Requested authoring mode is unavailable')
				}
			);
			return false;
		}
		if (this.picking && this.creationConcession) {
			this.creationConcession.changes = [
				this.creationConcession.changes[0],
				{ range, replacement: [{ kind: 'text', text: '' }] }
			];
		} else {
			const draft = newPlaybookDraft(range);
			if (requestedMode === 'concession')
				draft.concessions.push({
					id: newConcessionId(),
					tier: 'preferred',
					description: '',
					changes: [{ range, replacement: [{ kind: 'text', text: '' }] }]
				});
			if (!this.session.start(draft)) return false;
			this.reset();
			this.initialSelection = range;
			this.selectedTriggerId = null;
		}
		this.clearFeedback();
		return true;
	}
	openItem(itemId: string, annotationId: string) {
		if (this.creating) return false;
		const item = this.source().items?.find((item) => item._id === itemId);
		if (!item) return false;
		const annotation = documentAnnotations(item).find(
			(annotation) => annotation.id === annotationId
		);
		if (!annotation) return false;
		if (this.draft?.persistedId !== itemId) {
			if (!this.dismiss()) return false;
			if (!this.session.open(item)) return false;
			this.reset();
		}
		this.selectedAnnotationId = annotationId;
		this.selectedTriggerId =
			annotation.kind === 'trigger' ? annotation.triggerId : (item.triggers[0]?.id ?? null);
		this.clearFeedback();
		return true;
	}
	addConcession(tier: Concession['tier']) {
		if (this.creating || !this.entry?.confirmed || !this.draft) return false;
		this.clearFeedback();
		this.editError = this.session.updateTargetReadiness(this.entry.key);
		if (this.editError) return false;
		const { index, items, available, geometry } = this.source();
		if (!available || !index || !items || !geometry) {
			this.editError = 'Wait for the current contract';
			return false;
		}
		const trigger =
			this.draft.triggers.find((trigger) => trigger.id === this.selectedTriggerId) ??
			this.draft.triggers[0];
		if (!trigger) return false;
		const range = { start: { ...trigger.range.start }, end: { ...trigger.range.end } };
		const permission = evaluateConcessionAddition(index, range, this.draft, geometry);
		if (!permission.allowed) {
			this.editError =
				permission.issue.kind === 'cross-container'
					? 'This instruction box spans multiple clauses. To add a concession, delete and recreate it with text selected within one clause.'
					: selectionIssueMessage(permission.issue);
			return false;
		}
		this.previewConcessionId = null;
		this.pendingAddition = {
			key: this.entry.key,
			triggerId: trigger.id,
			concession: {
				id: newConcessionId(),
				tier,
				description: '',
				changes: [{ range, replacement: [{ kind: 'text', text: '' }] }]
			}
		};
		this.selectedTriggerId = trigger.id;
		this.initialSelection = range;
		this.step = 'concession';
		this.affectsOtherParts = false;
		this.clearFeedback();
		return true;
	}
	removeConcession(id: string): boolean {
		this.clearFeedback();
		const entry = this.entry;
		if (this.creating || !entry?.confirmed) {
			this.editError = 'Finish or cancel creation before updating this instruction box';
			return false;
		}
		if (!entry.draft.concessions.some((concession) => concession.id === id)) {
			this.editError = 'This concession is no longer available';
			return false;
		}
		const proposal = {
			...entry.draft,
			concessions: entry.draft.concessions.filter((concession) => concession.id !== id)
		};
		this.editError = this.session.replaceDraft(entry.key, proposal);
		return !this.editError;
	}
	cancelAddition() {
		this.pendingAddition = null;
		this.initialSelection = null;
		this.step = 'concession';
		this.affectsOtherParts = false;
		this.clearFeedback();
	}
	setAffectedPart(value: boolean) {
		this.affectsOtherParts = value;
		if (!value && this.creationConcession)
			this.creationConcession.changes = this.creationConcession.changes.slice(0, 1);
		this.clearFeedback();
	}
	next() {
		if (!this.stagedCreation || this.lastStep) return this.submit();
		if (this.readinessReason) return false;
		this.clearFeedback();
		this.step = 'other-part';
		return false;
	}
	back() {
		if (!this.canBack) return;
		this.step = 'concession';
		this.clearFeedback();
	}
	submit() {
		const entry = this.entry;
		if (!entry || (this.stagedCreation && !this.lastStep) || this.readinessReason) return false;
		this.clearFeedback();
		if (this.pendingAddition) {
			const concession = this.pendingAddition.concession;
			this.editError = this.session.replaceDraft(entry.key, {
				...entry.draft,
				concessions: [...entry.draft.concessions, concession]
			});
			if (this.editError) return false;
			this.cancelAddition();
			this.previewConcessionId = concession.id;
			return false;
		}
		return this.session.save();
	}
	/** Incidental dismissal never abandons local work. */
	dismiss() {
		if (this.hasUnsavedWork) {
			this.editError = this.session.unresolved
				? 'Resolve the current operation before leaving this instruction box.'
				: 'Save or cancel your changes first.';
			return false;
		}
		return !this.entry || this.cancel();
	}
	cancel() {
		if (!this.session.cancel()) return false;
		this.reset();
		return true;
	}
	useSaved() {
		this.session.useSaved();
		this.reset();
	}
}
