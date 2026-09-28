import { v } from 'convex/values';

const marks = v.object({ bold: v.optional(v.boolean()), italic: v.optional(v.boolean()) });
const atom = v.union(
	v.object({ kind: v.literal('text'), text: v.string(), marks: v.optional(marks) }),
	v.object({
		kind: v.literal('reference'),
		targetItemKey: v.string(),
		endTargetItemKey: v.optional(v.string())
	})
);
const segment = v.object({
	clauseKey: v.optional(v.string()),
	occurrenceKey: v.optional(v.string()),
	provisionKey: v.optional(v.string()),
	content: v.array(atom)
});
const numbering = v.object({
	itemKey: v.string(),
	sequenceKey: v.string(),
	parentItemKey: v.optional(v.string()),
	style: v.union(
		v.literal('decimal'),
		v.literal('lower-alpha'),
		v.literal('lower-roman'),
		v.literal('upper-alpha')
	),
	activationProvisionKey: v.optional(v.string())
});
const base = { blockKey: v.string(), order: v.number(), numbering: v.optional(numbering) };

export const contractBlock = v.union(
	v.object({
		...base,
		kind: v.literal('heading'),
		anchor: v.string(),
		level: v.union(v.literal(1), v.literal(2), v.literal(3)),
		content: v.array(segment)
	}),
	v.object({ ...base, kind: v.literal('paragraph'), content: v.array(segment) }),
	v.object({
		...base,
		kind: v.literal('table'),
		variant: v.optional(v.literal('signature')),
		headerRowCount: v.number(),
		rows: v.array(v.array(v.object({ content: v.array(segment) })))
	})
);

const concession = v.object({
	concessionKey: v.string(),
	copy: v.object({
		before: v.string(),
		after: v.optional(v.string()),
		detail: v.array(v.string())
	}),
	replacements: v.array(v.object({ targetProvisionKey: v.string(), content: v.array(atom) }))
});

export const editableCopyField = v.union(
	v.literal('summary'),
	v.literal('howToExplainToCustomers'),
	v.literal('commonObjections'),
	v.literal('negotiation'),
	v.literal('changesNeedEscalation')
);

const clauseBoxFields = {
	clauseKey: v.string(),
	summary: v.string(),
	howToExplainToCustomers: v.string(),
	commonObjections: v.string(),
	negotiation: v.string(),
	changesNeedEscalation: v.string(),
	showPreferredConcessionsInfoTooltip: v.boolean(),
	preferredConcessions: v.array(concession),
	rareConcessions: v.array(concession)
};

export const clauseBox = v.object(clauseBoxFields);
export const clauseBoxRecord = v.object({ id: v.id('clauseBoxes'), ...clauseBoxFields });
