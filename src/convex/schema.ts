import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { clauseBox, contractBlock } from './validators';

export default defineSchema({
	contractBlocks: defineTable(contractBlock).index('by_order', ['order']),
	clauseBoxes: defineTable(clauseBox).index('by_clause_key', ['clauseKey']),
	deletedClauseBoxes: defineTable({
		originalId: v.id('clauseBoxes'),
		undoToken: v.string(),
		box: clauseBox
	}).index('by_original_id', ['originalId'])
});
