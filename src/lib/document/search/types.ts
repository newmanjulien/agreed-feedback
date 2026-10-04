export interface TextMatch {
	start: number;
	end: number;
}

/** A paginated semantic location, independent of mounted text nodes. Offsets are UTF-16. */
export interface SearchPoint {
	pageNumber: number;
	fragmentKey: string;
	row?: number;
	cell?: number;
	tokenIndex: number;
	offset: number;
}

export interface DocumentSearchResult {
	start: SearchPoint;
	end: SearchPoint;
}
