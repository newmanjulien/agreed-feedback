import { v } from 'convex/values';
import { query } from './_generated/server';
import { clauseBoxRecord } from './validators';

export const list = query({
	args: {},
	returns: v.array(clauseBoxRecord),
	handler: async (ctx) => {
		const boxes = await ctx.db.query('clauseBoxes').withIndex('by_clause_key').collect();
		const seen = new Set<string>();
		for (const box of boxes) {
			if (!box.clauseKey.trim() || box.clauseKey !== box.clauseKey.trim())
				throw new Error(`Invalid live clause key: ${JSON.stringify(box.clauseKey)}`);
			if (seen.has(box.clauseKey)) throw new Error(`Duplicate live clause key: ${box.clauseKey}`);
			seen.add(box.clauseKey);
		}
		return boxes.map(({ _id, _creationTime, ...box }) => ({ id: _id, ...box }));
	}
});
