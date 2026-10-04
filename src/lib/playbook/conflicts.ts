import type { ContractChange, SourcePoint, SourceRange } from './model';
import { activatedBlock } from './geometry';
import { resolvePoint, type SourceIndex } from '../contract/source-index';
import {
	comparePoints,
	containsPoint,
	isEmptyRange,
	localContainer,
	rangesOverlap
} from '../contract/ranges';

export interface ChangeFootprint {
	consumedRange?: SourceRange;
	insertionPoint?: SourcePoint;
	structuralKeys: string[];
}

export function changeFootprint(index: SourceIndex, change: ContractChange): ChangeFootprint {
	localContainer(index, change.range);
	const block = activatedBlock(index, change);
	return {
		...(isEmptyRange(index, change.range)
			? { insertionPoint: change.range.start }
			: { consumedRange: change.range }),
		structuralKeys: block ? [block] : []
	};
}

export function changesConflict(index: SourceIndex, a: ContractChange, b: ContractChange): boolean {
	const x = changeFootprint(index, a);
	const y = changeFootprint(index, b);
	const touches = (footprint: ChangeFootprint, block: string): boolean => {
		const point = footprint.insertionPoint ?? footprint.consumedRange?.start;
		return Boolean(point && resolvePoint(index, point).blockKey === block);
	};
	return Boolean(
		x.structuralKeys.some((block) => touches(y, block)) ||
		y.structuralKeys.some((block) => touches(x, block)) ||
		(x.consumedRange &&
			y.consumedRange &&
			rangesOverlap(index, x.consumedRange, y.consumedRange)) ||
		(x.insertionPoint &&
			y.insertionPoint &&
			comparePoints(index, x.insertionPoint, y.insertionPoint) === 0) ||
		(x.insertionPoint &&
			y.consumedRange &&
			containsPoint(index, y.consumedRange, x.insertionPoint, true)) ||
		(y.insertionPoint &&
			x.consumedRange &&
			containsPoint(index, x.consumedRange, y.insertionPoint, true))
	);
}
