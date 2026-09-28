import type { ResolvedRun } from '$lib/contract/model';

export interface InlineToken extends Omit<ResolvedRun, 'text'> {
	value: string;
}

export type PageFragment = HeadingFragment | ParagraphFragment | TableFragment;

export interface HeadingFragment {
	type: 'heading';
	blockKey: string;
	anchor: string;
	level: 1 | 2 | 3;
	tokens: InlineToken[];
}

export interface ParagraphFragment {
	type: 'paragraph';
	blockKey: string;
	tokens: InlineToken[];
	isContinuation: boolean;
	isFinal: boolean;
	emptyInsertionSlot?: boolean;
}

export interface TableFragment {
	type: 'table';
	blockKey: string;
	variant?: 'signature';
	headerRowCount: number;
	rows: { tokens: InlineToken[] }[][];
}

export interface PageLayout {
	number: number;
	fragments: PageFragment[];
}

export interface PageMeasurement {
	fits(fragments: PageFragment[], pageIndex: number): boolean;
}
