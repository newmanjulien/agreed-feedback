import type { ContractChange } from './model';
import { activatedBlock } from './geometry';
import { pointPosition, resolvePoint, type SourceIndex } from '../contract/source-index';
import { localContainer } from '../contract/ranges';

export interface ChangeFootprint {
	start: number;
	end: number;
	block: string;
	structuralBlock?: string;
}

export function changeFootprint(index: SourceIndex, change: ContractChange): ChangeFootprint {
	localContainer(index, change.range);
	const structuralBlock = activatedBlock(index, change);
	return {
		start: pointPosition(index, change.range.start),
		end: pointPosition(index, change.range.end),
		block: resolvePoint(index, change.range.start).blockKey,
		structuralBlock
	};
}

function footprintsConflict(x: ChangeFootprint, y: ChangeFootprint): boolean {
	const xInsertion = x.start === x.end,
		yInsertion = y.start === y.end;
	return Boolean(
		x.structuralBlock === y.block ||
		y.structuralBlock === x.block ||
		(xInsertion && yInsertion
			? x.start === y.start
			: xInsertion
				? y.start <= x.start && x.start <= y.end
				: yInsertion
					? x.start <= y.start && y.start <= x.end
					: x.start < y.end && y.start < x.end)
	);
}

export function changesConflict(index: SourceIndex, a: ContractChange, b: ContractChange): boolean {
	return footprintsConflict(changeFootprint(index, a), changeFootprint(index, b));
}

/** Request-local memo: each change's source coordinates are resolved at most once.
 * Keeping it local also accepts in-place draft edits on the next validation call.
 */
export function createChangeConflictChecker(index: SourceIndex) {
	const footprints = new WeakMap<ContractChange, ChangeFootprint>();
	const footprint = (change: ContractChange) => {
		let value = footprints.get(change);
		if (!value) {
			value = changeFootprint(index, change);
			footprints.set(change, value);
		}
		return value;
	};
	return (a: ContractChange, b: ContractChange) => footprintsConflict(footprint(a), footprint(b));
}
