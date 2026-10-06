import type { BaselineBlock } from '../../src/lib/contract/source-model';
import type { Doc } from '../../src/convex/_generated/dataModel';

export const block: BaselineBlock = {
	kind: 'paragraph',
	blockKey: 'paragraph-1',
	order: 0,
	content: [{ kind: 'text', sourceKey: 'text-1', text: 'Synthetic contract.' }]
};

export const item: Omit<Doc<'playbookItems'>, '_id' | '_creationTime'> = {
	triggers: [],
	concessions: [
		{ id: 'preferred', tier: 'preferred', description: 'Synthetic choice.', changes: [] }
	]
};
