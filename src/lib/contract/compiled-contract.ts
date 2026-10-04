import type { BaselineBlock } from './source-model';
import { validateBaseline } from './validate-source';

/** Immutable source semantics only. Never owns layout, view intent, or DOM state. */
export class CompiledContract {
	readonly index;
	readonly validateReference;
	constructor(readonly blocks: readonly BaselineBlock[]) {
		const validated = validateBaseline(blocks);
		this.index = validated.index;
		this.validateReference = validated.validateReference;
	}
}
