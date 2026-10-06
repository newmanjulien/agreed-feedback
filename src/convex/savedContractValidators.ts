import { v } from 'convex/values';
import { baselineBlock } from './sourceValidators';
import schema from './schema';

export const selections = v.record(v.id('playbookItems'), v.string());
export const snapshot = v.object({
	blocks: v.array(baselineBlock),
	items: v.array(schema.doc('playbookItems'))
});
export const contractCard = schema
	.doc('savedContracts')
	.pick('_id', 'companyName', 'savedAt')
	.extend({
		creator: v.object({ name: v.string(), avatarUrl: v.union(v.string(), v.null()) })
	});
export const contractState = v.object({
	companyName: v.string(),
	selectedConcessions: selections,
	revision: v.number(),
	lastOperationId: v.union(v.string(), v.null())
});
export const saveResult = v.union(
	v.object({ status: v.literal('saved'), state: contractState }),
	v.object({ status: v.literal('conflict'), state: contractState }),
	v.object({ status: v.literal('deleted') })
);
