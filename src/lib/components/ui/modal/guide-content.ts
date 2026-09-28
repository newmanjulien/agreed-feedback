export type GuideVariant = 'rep' | 'admin';

type GuideContent = {
	title: string;
	intro: string;
	steps: { title: string; description: string; highlight?: string }[];
};

export const guideContent = {
	rep: {
		title: 'How Agreed works',
		intro: 'Agreed helps sales reps understand, negotiate and close sales contracts on their own.',
		steps: [
			{
				title: 'Open a clause',
				highlight: 'Green clauses have details.',
				description: 'Click to open up an explanation of the clause.'
			},
			{
				title: 'Understand the clause',
				description: 'All green clauses have a plain English explanation of what the clause means.'
			},
			{
				title: 'Negotiate the clause',
				description: 'Some clauses include information on how to negotiate the clause with buyers.'
			}
		]
	},
	admin: {
		title: 'How the admin view works',
		intro: 'Review and update the guidance your reps see when they open a clause.',
		steps: [
			{
				title: 'Open a clause',
				highlight: 'Green clauses have details.',
				description: 'Select one to see the guidance your reps will use.'
			},
			{
				title: 'Edit the guidance',
				description: 'Update the text in any section. Your changes are immediately visible to reps.'
			},
			{
				title: 'Contact Julien for other edits',
				description:
					'To add highlights or edit concessions, contact Julien. These aren’t available in the admin view yet.'
			}
		]
	}
} satisfies Record<GuideVariant, GuideContent>;
