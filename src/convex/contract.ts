import { v } from 'convex/values';
import { query } from './_generated/server';
import { contractBlock } from './validators';

export const getBlocks = query({
	args: {},
	returns: v.array(contractBlock),
	handler: async (ctx) => {
		const blocks = await ctx.db.query('contractBlocks').withIndex('by_order').collect();
		let previousOrder = -1;
		for (const block of blocks) {
			if (!Number.isSafeInteger(block.order) || block.order < 0)
				throw new Error(`Invalid live block order: ${block.blockKey}`);
			if (block.order <= previousOrder)
				throw new Error(`Duplicate or unsorted live block order: ${block.blockKey}`);
			previousOrder = block.order;
		}
		return blocks.map(({ _id, _creationTime, ...block }) => block);
	}
});
