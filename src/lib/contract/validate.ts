import type { ClauseBoxData, ContractBlock, InlineAtom, InlineSegment, Numbering } from './model';

export function validateContract({
	blocks,
	boxes
}: {
	blocks: ContractBlock[];
	boxes: ClauseBoxData[];
}): void {
	if (!blocks.length) throw new Error('Contract has no blocks.');
	const blockKeys = new Set<string>();
	const anchors = new Set<string>();
	const items = new Map<string, Numbering>();
	const itemPositions = new Map<string, number>();
	const sequenceOwners = new Map<string, { parent?: string; style: string }>();
	const clauses = new Set<string>();
	const occurrences = new Map<string, { clauseKey: string; location: string; visible: boolean }>();
	const provisions = new Map<
		string,
		{ clauseKey: string; segment: InlineSegment; location: string }
	>();
	const references: Extract<InlineAtom, { kind: 'reference' }>[] = [];
	const optional: { numbering: Numbering; block: ContractBlock }[] = [];
	function key(value: string, context: string) {
		if (!value?.trim() || value !== value.trim()) throw new Error(`Invalid ${context}: ${value}`);
	}
	function atoms(content: readonly InlineAtom[], location: string) {
		for (const atom of content) {
			if (atom.kind === 'text') {
				if (typeof atom.text !== 'string') throw new Error(`Invalid text: ${location}`);
			} else if (atom.kind === 'reference') {
				key(atom.targetItemKey, 'reference target');
				if (atom.endTargetItemKey) key(atom.endTargetItemKey, 'range target');
				references.push(atom);
			} else throw new Error(`Unknown inline atom: ${location}`);
		}
	}
	function segments(content: readonly InlineSegment[], location: string) {
		const closed = new Set<string>();
		let activeOccurrence: string | undefined;
		for (const segment of content) {
			if (segment.occurrenceKey !== activeOccurrence) {
				if (activeOccurrence) closed.add(activeOccurrence);
				if (segment.occurrenceKey && closed.has(segment.occurrenceKey))
					throw new Error(`Noncontiguous occurrence: ${segment.occurrenceKey}`);
				activeOccurrence = segment.occurrenceKey;
			}
			if (Boolean(segment.clauseKey) !== Boolean(segment.occurrenceKey))
				throw new Error(`Clause and occurrence must appear together: ${location}`);
			if (segment.provisionKey && !segment.clauseKey)
				throw new Error(`Provision without clause: ${location}`);
			if (segment.clauseKey && segment.occurrenceKey) {
				key(segment.clauseKey, 'clause key');
				key(segment.occurrenceKey, 'occurrence key');
				clauses.add(segment.clauseKey);
				const previous = occurrences.get(segment.occurrenceKey);
				if (
					previous &&
					(previous.clauseKey !== segment.clauseKey || previous.location !== location)
				)
					throw new Error(`Duplicate or conflicting occurrence: ${segment.occurrenceKey}`);
				occurrences.set(segment.occurrenceKey, {
					clauseKey: segment.clauseKey,
					location,
					visible: Boolean(
						previous?.visible ||
						segment.content.some((atom) => atom.kind === 'reference' || /\S/u.test(atom.text))
					)
				});
			}
			if (segment.provisionKey) {
				key(segment.provisionKey, 'provision key');
				if (provisions.has(segment.provisionKey))
					throw new Error(`Duplicate provision: ${segment.provisionKey}`);
				provisions.set(segment.provisionKey, { clauseKey: segment.clauseKey!, segment, location });
			}
			atoms(segment.content, location);
		}
	}
	let previousOrder = -1;
	for (const [index, block] of blocks.entries()) {
		key(block.blockKey, 'block key');
		if (blockKeys.has(block.blockKey)) throw new Error(`Duplicate block: ${block.blockKey}`);
		blockKeys.add(block.blockKey);
		if (!Number.isSafeInteger(block.order) || block.order < 0 || block.order <= previousOrder)
			throw new Error(`Invalid block order: ${block.blockKey}`);
		previousOrder = block.order;
		if (block.numbering) {
			const item = block.numbering;
			key(item.itemKey, 'item key');
			key(item.sequenceKey, 'sequence key');
			if (items.has(item.itemKey)) throw new Error(`Duplicate item: ${item.itemKey}`);
			if (!['decimal', 'lower-alpha', 'lower-roman', 'upper-alpha'].includes(item.style))
				throw new Error(`Invalid numbering style: ${item.itemKey}`);
			if (item.parentItemKey && !items.has(item.parentItemKey))
				throw new Error(`Missing or late parent: ${item.itemKey}`);
			if (item.parentItemKey && items.get(item.parentItemKey)?.activationProvisionKey)
				throw new Error(`Numbered item has an optional parent: ${item.itemKey}`);
			const sequence = sequenceOwners.get(item.sequenceKey);
			if (sequence && (sequence.parent !== item.parentItemKey || sequence.style !== item.style))
				throw new Error(`Mixed numbering sequence: ${item.sequenceKey}`);
			sequenceOwners.set(item.sequenceKey, { parent: item.parentItemKey, style: item.style });
			items.set(item.itemKey, item);
			itemPositions.set(item.itemKey, index);
			if (block.kind === 'table') throw new Error(`Table starts a numbered item: ${item.itemKey}`);
			if (item.activationProvisionKey) optional.push({ numbering: item, block });
		}
		if (block.kind === 'table') {
			if (
				!Number.isSafeInteger(block.headerRowCount) ||
				block.headerRowCount < 0 ||
				block.headerRowCount > block.rows.length ||
				!block.rows.length
			)
				throw new Error(`Invalid table header: ${block.blockKey}`);
			const width = block.rows[0].length;
			if (!width || block.rows.some((row) => row.length !== width))
				throw new Error(`Nonrectangular table: ${block.blockKey}`);
			for (const [rowIndex, row] of block.rows.entries())
				for (const [cellIndex, cell] of row.entries())
					segments(cell.content, `${block.blockKey}:${rowIndex}:${cellIndex}`);
		} else {
			if (block.kind === 'heading') {
				key(block.anchor, 'heading anchor');
				if (anchors.has(block.anchor)) throw new Error(`Duplicate heading anchor: ${block.anchor}`);
				anchors.add(block.anchor);
				if (![1, 2, 3].includes(block.level))
					throw new Error(`Invalid heading level: ${block.anchor}`);
			}
			segments(block.content, block.blockKey);
			if (block.numbering && !block.numbering.activationProvisionKey) {
				const firstAtom = block.content[0]?.content[0];
				if (!firstAtom || (firstAtom.kind === 'text' && /^\s/u.test(firstAtom.text)))
					throw new Error(
						`Numbered content must start without separator whitespace: ${block.blockKey}`
					);
				if (
					block.content.some(
						(segment) =>
							(!segment.content.length && !segment.provisionKey) ||
							segment.content.some((atom) => atom.kind === 'text' && !atom.text)
					)
				)
					throw new Error(`Empty numbered content: ${block.blockKey}`);
			}
		}
	}
	for (const { numbering, block } of optional) {
		const slot = provisions.get(numbering.activationProvisionKey!);
		if (
			!slot ||
			slot.location !== block.blockKey ||
			slot.segment.content.length ||
			block.kind !== 'paragraph' ||
			block.content.length !== 1 ||
			block.content[0] !== slot.segment
		)
			throw new Error(`Invalid optional insertion slot: ${numbering.itemKey}`);
	}
	const optionalKeys = new Set(optional.map(({ numbering }) => numbering.itemKey));
	const allowedEmptyOccurrences = new Set(
		optional.map(
			({ numbering }) => provisions.get(numbering.activationProvisionKey!)!.segment.occurrenceKey!
		)
	);
	for (const block of blocks)
		if (block.kind === 'table') {
			for (const row of block.rows)
				for (const cell of row) {
					if (
						cell.content.length === 1 &&
						cell.content[0].provisionKey &&
						cell.content[0].content.length === 0 &&
						cell.content[0].occurrenceKey
					)
						allowedEmptyOccurrences.add(cell.content[0].occurrenceKey);
				}
		}
	for (const [occurrenceKey, occurrence] of occurrences) {
		if (!occurrence.visible && !allowedEmptyOccurrences.has(occurrenceKey))
			throw new Error(`Invisible ordinary clause: ${occurrenceKey}`);
	}
	const boxKeys = new Set<string>();
	for (const box of boxes) {
		key(box.clauseKey, 'box clause key');
		if (boxKeys.has(box.clauseKey) || !clauses.has(box.clauseKey))
			throw new Error(`Duplicate or orphan clause box: ${box.clauseKey}`);
		boxKeys.add(box.clauseKey);
		const concessionKeys = new Set<string>();
		for (const concession of [...box.preferredConcessions, ...box.rareConcessions]) {
			key(concession.concessionKey, 'concession key');
			if (concessionKeys.has(concession.concessionKey))
				throw new Error(`Duplicate concession: ${box.clauseKey} / ${concession.concessionKey}`);
			concessionKeys.add(concession.concessionKey);
			if (
				!concession.copy.before?.trim() ||
				concession.copy.before !== concession.copy.before.trim() ||
				(concession.copy.after !== undefined &&
					(!concession.copy.after.trim() ||
						concession.copy.after !== concession.copy.after.trim())) ||
				concession.copy.detail.some((text) => !text.trim())
			)
				throw new Error(`Invalid concession copy: ${concession.concessionKey}`);
			if (!concession.replacements.length)
				throw new Error(`Empty concession: ${concession.concessionKey}`);
			const targets = new Set<string>();
			for (const replacement of concession.replacements) {
				if (
					targets.has(replacement.targetProvisionKey) ||
					provisions.get(replacement.targetProvisionKey)?.clauseKey !== box.clauseKey
				)
					throw new Error(
						`Duplicate or foreign replacement: ${concession.concessionKey} / ${replacement.targetProvisionKey}`
					);
				targets.add(replacement.targetProvisionKey);
				if (
					!replacement.content.length ||
					!replacement.content.some((atom) => atom.kind === 'reference' || atom.text.trim())
				)
					throw new Error(`Empty replacement: ${concession.concessionKey}`);
				atoms(replacement.content, concession.concessionKey);
			}
		}
	}
	// Validate references after collecting both source and replacement atoms.
	for (const ref of references) {
		const start = items.get(ref.targetItemKey);
		const end = ref.endTargetItemKey ? items.get(ref.endTargetItemKey) : undefined;
		if (
			!start ||
			(ref.endTargetItemKey && !end) ||
			optionalKeys.has(ref.targetItemKey) ||
			(ref.endTargetItemKey && optionalKeys.has(ref.endTargetItemKey))
		)
			throw new Error(`Unresolved structural reference: ${ref.targetItemKey}`);
		if (end && (end.sequenceKey !== start.sequenceKey || end.parentItemKey !== start.parentItemKey))
			throw new Error(`Range crosses numbering sequences: ${ref.targetItemKey}`);
		if (end && itemPositions.get(ref.endTargetItemKey!)! <= itemPositions.get(ref.targetItemKey)!)
			throw new Error(`Range ends before it starts: ${ref.targetItemKey}`);
	}
}
