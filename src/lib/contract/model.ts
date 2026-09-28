import type { Infer } from 'convex/values';
import type {
	clauseBox,
	clauseBoxRecord,
	contractBlock,
	editableCopyField
} from '../../convex/validators';

// Persisted shapes belong to the Convex schema. Document rendering uses only domain fields.
export type ContractBlock = Infer<typeof contractBlock>;
export type ClauseBoxData = Infer<typeof clauseBox>;
export type ClauseBoxRecord = Infer<typeof clauseBoxRecord>;
export type Concession = ClauseBoxData['preferredConcessions'][number];
export type SelectedConcession = Pick<Concession, 'concessionKey' | 'replacements'>;
export type InlineSegment = Extract<ContractBlock, { kind: 'paragraph' }>['content'][number];
export type InlineAtom = InlineSegment['content'][number];
export type Numbering = NonNullable<ContractBlock['numbering']>;
export type TextMarks = Extract<InlineAtom, { kind: 'text' }>['marks'];
export type EditableCopyKey = Infer<typeof editableCopyField>;
export type ContractView = 'effective' | 'redline';

export interface ResolvedRun {
	text: string;
	marks?: TextMarks;
	revision?: 'removed' | 'added';
	clauseKey?: string;
	occurrenceKey?: string;
}
export type ResolvedBlock =
	| { kind: 'heading'; blockKey: string; anchor: string; level: 1 | 2 | 3; content: ResolvedRun[] }
	| { kind: 'paragraph'; blockKey: string; content: ResolvedRun[]; emptyInsertionSlot?: boolean }
	| {
			kind: 'table';
			blockKey: string;
			variant?: 'signature';
			headerRowCount: number;
			rows: { content: ResolvedRun[] }[][];
	  };
