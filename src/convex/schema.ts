import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { baselineBlock } from './sourceValidators';
import { playbookItem } from './playbookValidators';
export default defineSchema({
	contractBlocks: defineTable(baselineBlock).index('by_order', ['order']),
	playbookItems: defineTable(
		playbookItem.extend({
			// Read old records without migration; full-item saves remove this unused field.
			authoringMode: v.optional(v.union(v.literal('explain'), v.literal('concession'))),
			revision: v.optional(v.number()),
			lastOperationId: v.optional(v.string())
		})
	),
	// Transport receipts survive deletion; retry must never recreate a deleted item.
	creationReceipts: defineTable({ operationId: v.string(), itemId: v.id('playbookItems') }).index(
		'by_operationId',
		['operationId']
	)
});
