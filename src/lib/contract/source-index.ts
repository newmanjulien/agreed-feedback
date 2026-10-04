import type { BaselineBlock, InlineSource, SourcePoint } from './source-model';
import { numberSourceKey } from './source-model';
import { numberAddresses, referenceText, type Address } from './numbering';

export interface SourceUnit {
	readonly sourceKey: string;
	readonly kind: InlineSource['kind'] | 'number';
	readonly containerKey: string;
	readonly blockKey: string;
	readonly inTable: boolean;
	readonly position: number;
	/** UTF-16 code units for text (same as DOM offsets), 1 for atomic units. */
	readonly length: number;
	readonly displayText: string;
}
export interface SourceContainer {
	readonly containerKey: string;
	readonly blockKey: string;
	readonly inTable: boolean;
	readonly units: readonly SourceUnit[];
}
export interface SourceIndex {
	readonly units: readonly SourceUnit[];
	readonly byKey: ReadonlyMap<string, SourceUnit>;
	readonly containers: ReadonlyMap<string, SourceContainer>;
	readonly blocks: ReadonlyMap<string, BaselineBlock>;
}
export function sourceAddresses(
	blocks: readonly BaselineBlock[],
	activeBlocks: ReadonlySet<string> = new Set()
): Map<string, Address> {
	return numberAddresses(
		blocks.filter((b) => b.kind !== 'paragraph' || !b.optional || activeBlocks.has(b.blockKey))
	);
}

/** Copies display/coordinate data; generated display changes never change source coordinates. */
export function buildSourceIndex(
	blocks: readonly BaselineBlock[],
	addresses = sourceAddresses(blocks)
): SourceIndex {
	const units: SourceUnit[] = [];
	const byKey = new Map<string, SourceUnit>();
	const containers = new Map<string, SourceContainer>();
	const blockMap = new Map<string, BaselineBlock>();
	let position = 0;
	let previousOrder = -1;
	function container(
		block: BaselineBlock,
		containerKey: string,
		content: readonly InlineSource[],
		inTable: boolean
	) {
		const local: SourceUnit[] = [];
		function add(sourceKey: string, kind: SourceUnit['kind'], length: number, displayText: string) {
			if (!sourceKey.trim() || sourceKey !== sourceKey.trim() || byKey.has(sourceKey))
				throw new Error(`Invalid or duplicate source: ${sourceKey}`);
			const unit = Object.freeze({
				sourceKey,
				kind,
				length,
				displayText,
				containerKey,
				blockKey: block.blockKey,
				inTable,
				position
			});
			units.push(unit);
			local.push(unit);
			byKey.set(sourceKey, unit);
			position += length;
		}
		if (!inTable && block.numbering)
			add(
				numberSourceKey(block.numbering.itemKey),
				'number',
				1,
				addresses.get(block.numbering.itemKey)?.label ?? ''
			);
		for (const atom of content) {
			if (atom.sourceKey.startsWith('number:'))
				throw new Error(`Reserved source namespace: ${atom.sourceKey}`);
			add(
				atom.sourceKey,
				atom.kind,
				atom.kind === 'text' ? atom.text.length : 1,
				atom.kind === 'text' ? atom.text : referenceText(atom, addresses)
			);
		}
		if (!local.length)
			throw new Error(`Container needs a persisted empty text anchor: ${containerKey}`);
		if (containers.has(containerKey)) throw new Error(`Duplicate container: ${containerKey}`);
		containers.set(
			containerKey,
			Object.freeze({
				containerKey,
				blockKey: block.blockKey,
				inTable,
				units: Object.freeze(local)
			})
		);
		position++; // Structural boundaries are distinct even for two empty containers.
	}
	for (const block of blocks) {
		if (
			!block.blockKey.trim() ||
			block.blockKey !== block.blockKey.trim() ||
			blockMap.has(block.blockKey)
		)
			throw new Error(`Invalid or duplicate block: ${block.blockKey}`);
		if (!Number.isSafeInteger(block.order) || block.order <= previousOrder)
			throw new Error(`Invalid block order: ${block.blockKey}`);
		previousOrder = block.order;
		blockMap.set(block.blockKey, block);
		if (block.kind === 'table')
			block.rows.forEach((row, r) =>
				row.forEach((cell, c) =>
					container(block, `${block.blockKey}/cell/${r}/${c}`, cell.content, true)
				)
			);
		else container(block, block.blockKey, block.content, false);
	}
	return { units: Object.freeze(units), byKey, containers, blocks: blockMap };
}
export function resolvePoint(index: SourceIndex, point: SourcePoint): SourceUnit {
	const unit = index.byKey.get(point.sourceKey);
	if (
		!unit ||
		!Number.isSafeInteger(point.offset) ||
		point.offset < 0 ||
		point.offset > unit.length
	)
		throw new Error(`Invalid source point: ${point.sourceKey}@${point.offset}`);
	return unit;
}
export function pointPosition(index: SourceIndex, point: SourcePoint): number {
	return resolvePoint(index, point).position + point.offset;
}
