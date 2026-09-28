import { numberAddresses, referenceText } from './numbering';
import type {
	SelectedConcession,
	ContractBlock,
	ContractView,
	InlineAtom,
	InlineSegment,
	ResolvedBlock,
	ResolvedRun
} from './model';

/** Resolve ordered blocks into effective text or a redline for a concession selection. */
export function resolveContract({
	blocks,
	selectedConcessions,
	view
}: {
	blocks: readonly ContractBlock[];
	selectedConcessions: Readonly<Record<string, SelectedConcession>>;
	view: ContractView;
}): ResolvedBlock[] {
	const replacements = new Map<string, InlineAtom[]>();
	for (const concession of Object.values(selectedConcessions))
		for (const edit of concession.replacements)
			replacements.set(edit.targetProvisionKey, edit.content);
	const baseline = numberAddresses(blocks, new Set());
	const current = numberAddresses(blocks, new Set(replacements.keys()));
	function atoms(
		content: readonly InlineAtom[],
		annotation: Pick<ResolvedRun, 'clauseKey' | 'occurrenceKey'>,
		addresses: 'compare' | 'baseline' | 'current' = 'compare'
	): ResolvedRun[] {
		return content.flatMap((atom): ResolvedRun[] => {
			if (atom.kind === 'text')
				return [{ text: atom.text, ...(atom.marks ? { marks: atom.marks } : {}), ...annotation }];
			const text = referenceText(atom, addresses === 'baseline' ? baseline : current);
			const previous = baseline.has(atom.targetItemKey) ? referenceText(atom, baseline) : text;
			return addresses === 'compare' && view === 'redline' && previous !== text
				? [
						{ text: previous, revision: 'removed', ...annotation },
						{ text, revision: 'added', ...annotation }
					]
				: [{ text, ...annotation }];
		});
	}
	function addedContent(content: ResolvedRun[]): ResolvedRun[] {
		if (view !== 'redline') return content;
		const first = content.findIndex((run) => /\S/u.test(run.text));
		if (first === -1) return content;
		const last = content.findLastIndex((run) => /\S/u.test(run.text));
		return content.flatMap((run, index) => {
			if (index < first || index > last) return [run];
			const leading = index === first ? (/^\s+/u.exec(run.text)?.[0].length ?? 0) : 0;
			const trailing = index === last ? (/\s+$/u.exec(run.text)?.[0].length ?? 0) : 0;
			const end = Math.max(leading, run.text.length - trailing);
			return [
				...(leading ? [{ ...run, text: run.text.slice(0, leading) }] : []),
				...(end > leading
					? [{ ...run, text: run.text.slice(leading, end), revision: 'added' as const }]
					: []),
				...(end < run.text.length ? [{ ...run, text: run.text.slice(end) }] : [])
			];
		});
	}
	function inline(segments: readonly InlineSegment[]): ResolvedRun[] {
		return segments.flatMap((segment) => {
			const annotation = segment.clauseKey
				? { clauseKey: segment.clauseKey, occurrenceKey: segment.occurrenceKey }
				: {};
			const edit = segment.provisionKey ? replacements.get(segment.provisionKey) : undefined;
			if (!edit) return atoms(segment.content, annotation);
			const replacement = addedContent(atoms(edit, annotation, 'current'));
			if (view === 'effective' || segment.content.length === 0) return replacement;
			return [
				...atoms(segment.content, annotation, 'baseline').map((run) => ({
					...run,
					revision: 'removed' as const
				})),
				{ text: ' ', ...annotation },
				...replacement
			];
		});
	}
	function prefix(runs: ResolvedRun[], label: string, previous?: string): ResolvedRun[] {
		// Numbering owns the separator, including for legacy content with leading whitespace.
		const firstIndex = runs.findIndex((run) => /\S/u.test(run.text));
		const content = firstIndex < 0 ? [] : runs.slice(firstIndex);
		if (content.length) content[0] = { ...content[0], text: content[0].text.replace(/^\s+/u, '') };
		const first = content[0];
		const annotation = first?.clauseKey
			? { clauseKey: first.clauseKey, occurrenceKey: first.occurrenceKey }
			: {};
		const labelRuns: ResolvedRun[] =
			view === 'redline' && previous && previous !== label
				? [
						{ text: previous, revision: 'removed', ...annotation },
						{ text: ' ', ...annotation },
						{ text: label, revision: 'added', ...annotation }
					]
				: [
						{
							text: label,
							...(!previous && view === 'redline' ? { revision: 'added' as const } : {}),
							...annotation
						}
					];
		return [...labelRuns, ...(content.length ? [{ text: ' ', ...annotation }] : []), ...content];
	}
	return blocks.map((block): ResolvedBlock => {
		if (block.kind === 'table')
			return {
				kind: 'table',
				blockKey: block.blockKey,
				...(block.variant ? { variant: block.variant } : {}),
				headerRowCount: block.headerRowCount,
				rows: block.rows.map((row) =>
					row.map((cell) => {
						const content = inline(cell.content);
						return {
							content:
								content.length || !cell.content.some((segment) => segment.clauseKey)
									? content
									: [
											{
												text: '\u00a0',
												clauseKey: cell.content[0].clauseKey,
												occurrenceKey: cell.content[0].occurrenceKey
											}
										]
						};
					})
				)
			};
		let runs = inline(block.content);
		const item = block.numbering;
		let emptyInsertionSlot = false;
		if (item?.activationProvisionKey && !replacements.has(item.activationProvisionKey)) {
			const slot = block.content.find(
				(segment) => segment.provisionKey === item.activationProvisionKey
			);
			if (!slot || block.kind !== 'paragraph')
				throw new Error(`Invalid insertion slot: ${item.itemKey}`);
			runs = [
				{
					text: '\u00a0',
					clauseKey: slot.clauseKey,
					occurrenceKey: slot.occurrenceKey
				}
			];
			emptyInsertionSlot = true;
		} else if (item) {
			const label = current.get(item.itemKey)?.label;
			if (!label) throw new Error(`Missing number: ${item.itemKey}`);
			runs = prefix(runs, label, baseline.get(item.itemKey)?.label);
		}
		return block.kind === 'heading'
			? {
					kind: 'heading',
					blockKey: block.blockKey,
					anchor: block.anchor,
					level: block.level,
					content: runs
				}
			: {
					kind: 'paragraph',
					blockKey: block.blockKey,
					content: runs,
					...(emptyInsertionSlot ? { emptyInsertionSlot } : {})
				};
	});
}
