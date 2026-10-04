import { v } from 'convex/values';

// Immutable source coordinates, inline atoms, and baseline blocks.
export const sourcePoint = v.object({ sourceKey: v.string(), offset: v.number() });
export const sourceRange = v.object({ start: sourcePoint, end: sourcePoint });
const referenceFields = {
	kind: v.literal('reference'),
	targetItemKey: v.string(),
	endTargetItemKey: v.optional(v.string())
};
export const textMarks = v.object({
	bold: v.optional(v.boolean()),
	italic: v.optional(v.boolean())
});
export const replacementAtom = v.union(
	v.object({ kind: v.literal('text'), text: v.string(), marks: v.optional(textMarks) }),
	v.object(referenceFields)
);
export const inlineSource = v.union(
	v.object({
		kind: v.literal('text'),
		sourceKey: v.string(),
		text: v.string(),
		marks: v.optional(textMarks)
	}),
	v.object({ ...referenceFields, sourceKey: v.string() })
);
export const sourceNumbering = v.object({
	itemKey: v.string(),
	sequenceKey: v.string(),
	parentItemKey: v.optional(v.string()),
	style: v.union(
		v.literal('decimal'),
		v.literal('lower-alpha'),
		v.literal('lower-roman'),
		v.literal('upper-alpha')
	)
});
const base = { blockKey: v.string(), order: v.number(), numbering: v.optional(sourceNumbering) };
export const baselineBlock = v.union(
	v.object({
		...base,
		kind: v.literal('heading'),
		anchor: v.string(),
		level: v.union(v.literal(1), v.literal(2), v.literal(3)),
		content: v.array(inlineSource)
	}),
	v.object({
		...base,
		kind: v.literal('paragraph'),
		optional: v.optional(v.boolean()),
		content: v.array(inlineSource)
	}),
	v.object({
		...base,
		kind: v.literal('table'),
		variant: v.optional(v.literal('signature')),
		headerRowCount: v.number(),
		rows: v.array(v.array(v.object({ content: v.array(inlineSource) })))
	})
);
