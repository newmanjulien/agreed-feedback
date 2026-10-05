import { v } from 'convex/values';
import { baselineBlock } from './sourceValidators';
import schema from './schema';

export const selections = v.record(v.id('playbookItems'), v.string());
export const snapshot = v.object({
	blocks: v.array(baselineBlock),
	items: v.array(schema.doc('playbookItems')),
	baselineVersion: v.string(),
	playbookVersion: v.string()
});
export const contractCard = schema.doc('savedContracts').pick('_id', 'companyName', 'savedAt');
