interface HighlightLike {
	priority: number;
}

interface HighlightRegistryLike {
	delete(name: string): boolean;
	set(name: string, highlight: HighlightLike): void;
}

type HighlightConstructor = new (...ranges: Range[]) => HighlightLike;

function getHighlightApi(): {
	registry: HighlightRegistryLike;
	HighlightClass: HighlightConstructor;
} | null {
	if (typeof CSS === 'undefined') return null;

	const registry = (CSS as typeof CSS & { highlights?: HighlightRegistryLike }).highlights;
	const HighlightClass = (
		globalThis as typeof globalThis & {
			Highlight?: HighlightConstructor;
		}
	).Highlight;

	if (!registry || !HighlightClass) return null;
	return { registry, HighlightClass };
}

export function customHighlightsSupported(): boolean {
	return getHighlightApi() !== null;
}

export function clearCustomHighlights(...names: string[]) {
	const api = getHighlightApi();
	if (!api) return;
	for (const name of names) api.registry.delete(name);
}

export function setCustomHighlight(name: string, ranges: Range[], priority: number) {
	const api = getHighlightApi();
	if (!api || ranges.length === 0) return;

	const highlight = new api.HighlightClass(...ranges);
	highlight.priority = priority;
	api.registry.set(name, highlight);
}
