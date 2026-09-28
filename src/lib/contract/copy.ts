/** Preserve textarea content in storage; split only for public paragraph display. */
export function displayParagraphs(value: string): string[] {
	return value
		.split(/\n\s*\n/u)
		.map((text) => text.trim())
		.filter(Boolean);
}
