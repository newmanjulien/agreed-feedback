const PAGE_WIDTH = 816;
const HORIZONTAL_PADDING = 96;

export const PAGE_FORMAT = {
	width: PAGE_WIDTH,
	height: 1056,
	horizontalPadding: HORIZONTAL_PADDING,
	firstTopPadding: 116,
	topPadding: 96,
	bottomPadding: 88,
	contentWidth: PAGE_WIDTH - HORIZONTAL_PADDING * 2,
	gap: 16
} as const;
