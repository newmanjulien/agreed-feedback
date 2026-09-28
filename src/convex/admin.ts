import { v } from 'convex/values';
import { internal } from './_generated/api';
import { internalMutation, mutation } from './_generated/server';
import { editableCopyField } from './validators';

const UNDO_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

const saveCopyResult = v.union(
	v.object({ status: v.literal('updated'), currentValue: v.string() }),
	v.object({ status: v.literal('unchanged'), currentValue: v.string() }),
	v.object({ status: v.literal('conflict'), currentValue: v.string() }),
	v.object({ status: v.literal('missing') })
);
const saveTooltipResult = v.union(
	v.object({ status: v.literal('updated'), currentValue: v.boolean() }),
	v.object({ status: v.literal('unchanged'), currentValue: v.boolean() }),
	v.object({ status: v.literal('conflict'), currentValue: v.boolean() }),
	v.object({ status: v.literal('missing') })
);

export const saveCopy = mutation({
	args: {
		id: v.id('clauseBoxes'),
		section: editableCopyField,
		value: v.string(),
		expectedValue: v.string()
	},
	returns: saveCopyResult,
	handler: async (ctx, { id, section, value, expectedValue }) => {
		const box = await ctx.db.get('clauseBoxes', id);
		if (!box) return { status: 'missing' as const };
		const currentValue = box[section];
		if (currentValue === value) return { status: 'unchanged' as const, currentValue };
		if (currentValue !== expectedValue) return { status: 'conflict' as const, currentValue };
		await ctx.db.patch('clauseBoxes', id, { [section]: value });
		return { status: 'updated' as const, currentValue: value };
	}
});

export const saveTooltip = mutation({
	args: { id: v.id('clauseBoxes'), enabled: v.boolean(), expectedValue: v.boolean() },
	returns: saveTooltipResult,
	handler: async (ctx, { id, enabled, expectedValue }) => {
		const box = await ctx.db.get('clauseBoxes', id);
		if (!box) return { status: 'missing' as const };
		const currentValue = box.showPreferredConcessionsInfoTooltip;
		if (currentValue === enabled) return { status: 'unchanged' as const, currentValue };
		if (currentValue !== expectedValue) return { status: 'conflict' as const, currentValue };
		await ctx.db.patch('clauseBoxes', id, { showPreferredConcessionsInfoTooltip: enabled });
		return { status: 'updated' as const, currentValue: enabled };
	}
});

export const deleteBox = mutation({
	args: { id: v.id('clauseBoxes'), undoToken: v.string() },
	returns: v.union(
		v.object({ status: v.literal('deleted'), clauseKey: v.string() }),
		v.object({ status: v.literal('already_missing') })
	),
	handler: async (ctx, { id, undoToken }) => {
		const box = await ctx.db.get('clauseBoxes', id);
		if (!box) {
			const deleted = await ctx.db
				.query('deletedClauseBoxes')
				.withIndex('by_original_id', (q) => q.eq('originalId', id))
				.first();
			return deleted?.undoToken === undoToken
				? { status: 'deleted' as const, clauseKey: deleted.box.clauseKey }
				: { status: 'already_missing' as const };
		}
		const { _id, _creationTime, ...data } = box;
		const deletedId = await ctx.db.insert('deletedClauseBoxes', {
			originalId: id,
			undoToken,
			box: data
		});
		await ctx.scheduler.runAfter(UNDO_RETENTION_MS, internal.admin.expireDeletedBox, { deletedId });
		await ctx.db.delete('clauseBoxes', id);
		return { status: 'deleted' as const, clauseKey: data.clauseKey };
	}
});

export const restoreBox = mutation({
	args: { id: v.id('clauseBoxes'), undoToken: v.string() },
	returns: v.union(
		v.object({ status: v.literal('restored') }),
		v.object({ status: v.literal('conflict') }),
		v.object({ status: v.literal('missing') })
	),
	handler: async (ctx, { id, undoToken }) => {
		const deleted = await ctx.db
			.query('deletedClauseBoxes')
			.withIndex('by_original_id', (q) => q.eq('originalId', id))
			.first();
		if (!deleted || deleted.undoToken !== undoToken) return { status: 'missing' as const };
		const box = deleted.box;
		const existing = await ctx.db
			.query('clauseBoxes')
			.withIndex('by_clause_key', (q) => q.eq('clauseKey', box.clauseKey))
			.first();
		if (existing) {
			await ctx.db.delete('deletedClauseBoxes', deleted._id);
			return { status: 'conflict' as const };
		}
		await ctx.db.insert('clauseBoxes', box);
		await ctx.db.delete('deletedClauseBoxes', deleted._id);
		return { status: 'restored' as const };
	}
});

export const expireDeletedBox = internalMutation({
	args: { deletedId: v.id('deletedClauseBoxes') },
	returns: v.null(),
	handler: async (ctx, { deletedId }) => {
		if (await ctx.db.get('deletedClauseBoxes', deletedId))
			await ctx.db.delete('deletedClauseBoxes', deletedId);
		return null;
	}
});
