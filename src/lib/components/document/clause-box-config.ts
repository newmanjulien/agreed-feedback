import type { EditableCopyKey } from '$lib/contract/model';

export const CLAUSE_BOX_TEXT_SECTIONS = [
	{
		key: 'howToExplainToBuyers',
		label: 'How to explain to buyers',
		placeholder: 'Give reps a talk track'
	},
	{
		key: 'commonObjections',
		label: 'Common objections',
		placeholder: 'List common objections for this clause'
	},
	{
		key: 'negotiation',
		label: 'How to negotiate',
		placeholder: 'Give reps advice on how to negotiate'
	},
	{
		key: 'changesNeedEscalation',
		label: 'Changes need to be escalated',
		placeholder: 'Who do changes need to be escalated to?'
	}
] as const satisfies readonly {
	key: Exclude<EditableCopyKey, 'summary'>;
	label: string;
	placeholder: string;
}[];

export const CLAUSE_BOX_CONCESSION_SECTIONS = [
	{ key: 'preferredConcessions', label: 'Preferred', tone: 'default' },
	{ key: 'rareConcessions', label: 'Rare', tone: 'danger' }
] as const;
