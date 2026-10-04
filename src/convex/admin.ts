import { validatePlaybook } from '../lib/playbook/audit';
import { v } from 'convex/values';
import { mutation, type MutationCtx } from './_generated/server';
import type { Doc } from './_generated/dataModel';
import schema from './schema';
import { playbookItem } from './playbookValidators';
import type { PlaybookItem } from '../lib/playbook/model';
import { equalPlaybookStructure } from '../lib/playbook/draft';
import {
	validatePlaybookItemContent,
	validateNewConcessions,
	validateConcessionUpdate,
	MAX_CONTRACT_BLOCKS,
	MAX_PLAYBOOK_ITEMS
} from '../lib/playbook/validation';

async function validate(ctx: MutationCtx, item: PlaybookItem, saved?: Doc<'playbookItems'>) {
	try {
		if (saved && equalPlaybookStructure(saved, item)) {
			validatePlaybookItemContent(item);
			return null;
		}
		const blocks = await ctx.db
			.query('contractBlocks')
			.withIndex('by_order')
			.take(MAX_CONTRACT_BLOCKS + 1);
		const existing = await ctx.db.query('playbookItems').take(MAX_PLAYBOOK_ITEMS + 1);
		if (existing.length > MAX_PLAYBOOK_ITEMS)
			return { status: 'rejected' as const, message: 'Playbook exceeds supported size' };
		if (saved) validateConcessionUpdate(saved, item);
		else validateNewConcessions(item.concessions);
		validatePlaybook(blocks, [...existing.filter((record) => record._id !== saved?._id), item]);
		return null;
	} catch (error) {
		return {
			status: 'rejected' as const,
			message: error instanceof Error ? error.message : 'Invalid Playbook Item'
		};
	}
}

const conflict = v.object({ status: v.literal('conflict'), item: schema.doc('playbookItems') });
const missing = v.object({ status: v.literal('missing') });

/** One atomic snapshot per operation. Replays acknowledge; they never write again. */
export const savePlaybookItem = mutation({
	args: {
		id: v.optional(v.id('playbookItems')),
		item: playbookItem,
		expectedRevision: v.number(),
		operationId: v.string()
	},
	returns: v.union(
		v.object({ status: v.literal('saved'), item: schema.doc('playbookItems') }),
		conflict,
		v.object({ status: v.literal('rejected'), message: v.string() }),
		missing
	),
	handler: async (ctx, { id, item, expectedRevision, operationId }) => {
		if (
			!Number.isSafeInteger(expectedRevision) ||
			expectedRevision < 0 ||
			!/^[0-9a-f-]{36}$/i.test(operationId)
		)
			throw new Error('Invalid save operation');
		if (!id) {
			const receipt = await ctx.db
				.query('creationReceipts')
				.withIndex('by_operationId', (q) => q.eq('operationId', operationId))
				.unique();
			if (receipt) {
				const current = await ctx.db.get('playbookItems', receipt.itemId);
				if (!current) return { status: 'missing' as const };
				return {
					status:
						current.lastOperationId === operationId ? ('saved' as const) : ('conflict' as const),
					item: current
				};
			}
			const created = {
				...item,
				revision: 1,
				lastOperationId: operationId
			};
			const rejection = await validate(ctx, item);
			if (rejection) return rejection;
			const newId = await ctx.db.insert('playbookItems', created);
			await ctx.db.insert('creationReceipts', { operationId, itemId: newId });
			return { status: 'saved' as const, item: (await ctx.db.get('playbookItems', newId))! };
		}
		const current = await ctx.db.get('playbookItems', id);
		if (!current) return { status: 'missing' as const };
		if (current.lastOperationId === operationId) return { status: 'saved' as const, item: current };
		if ((current.revision ?? 0) !== expectedRevision)
			return { status: 'conflict' as const, item: current };
		const rejection = await validate(ctx, item, current);
		if (rejection) return rejection;
		await ctx.db.replace('playbookItems', id, {
			...item,
			revision: expectedRevision + 1,
			lastOperationId: operationId
		});
		return { status: 'saved' as const, item: (await ctx.db.get('playbookItems', id))! };
	}
});

export const deletePlaybookItem = mutation({
	args: { id: v.id('playbookItems'), expectedRevision: v.number() },
	returns: v.union(v.object({ status: v.literal('deleted') }), conflict),
	handler: async (ctx, { id, expectedRevision }) => {
		const current = await ctx.db.get('playbookItems', id);
		if (current && (current.revision ?? 0) !== expectedRevision)
			return { status: 'conflict' as const, item: current };
		if (current) await ctx.db.delete('playbookItems', id);
		return { status: 'deleted' as const };
	}
});
