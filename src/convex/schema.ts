import { defineSchema, defineTable, docValidator } from 'convex/server';
import { v } from 'convex/values';
import { baselineBlock } from './sourceValidators';
import { playbookItem } from './playbookValidators';
const playbookItems = defineTable(
	playbookItem.extend({
		// Read old records without migration; full-item saves remove this unused field.
		authoringMode: v.optional(v.union(v.literal('explain'), v.literal('concession'))),
		revision: v.optional(v.number()),
		lastOperationId: v.optional(v.string())
	})
);
export default defineSchema({
	contractBlocks: defineTable(baselineBlock).index('by_order', ['order']),
	playbookItems,
	savedContracts: defineTable({
		companyName: v.string(),
		savedAt: v.number(),
		selectedConcessions: v.record(v.id('playbookItems'), v.string()),
		revision: v.optional(v.number()),
		lastOperationId: v.optional(v.string()),
		// Legacy snapshot hashes; no longer written or returned.
		baselineVersion: v.optional(v.string()),
		playbookVersion: v.optional(v.string()),
		blockCount: v.number(),
		itemCount: v.number()
	})
		.index('by_savedAt', ['savedAt'])
		.searchIndex('search_companyName', { searchField: 'companyName' }),
	contractSnapshotBlocks: defineTable({
		contractId: v.id('savedContracts'),
		block: baselineBlock
	}).index('by_contractId', ['contractId']),
	contractSnapshotItems: defineTable({
		contractId: v.id('savedContracts'),
		itemId: v.id('playbookItems'),
		// Keep the original identity even after the live playbook item is deleted.
		item: docValidator('playbookItems', playbookItems)
	})
		.index('by_contractId', ['contractId'])
		.index('by_contractId_and_itemId', ['contractId', 'itemId']),
	// Receipts survive contract deletion so a creation retry cannot resurrect it.
	contractCreationReceipts: defineTable({
		operationId: v.string(),
		contractId: v.id('savedContracts')
	}).index('by_operationId', ['operationId']),
	// Transport receipts survive deletion; retry must never recreate a deleted item.
	creationReceipts: defineTable({ operationId: v.string(), itemId: v.id('playbookItems') }).index(
		'by_operationId',
		['operationId']
	)
});
