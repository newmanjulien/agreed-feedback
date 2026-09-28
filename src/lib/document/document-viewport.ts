const DEFAULT_HEADER_HEIGHT = 51;
const DEFAULT_VIEWPORT_GAP = 16;

function cssPixelValue(styles: CSSStyleDeclaration, property: string, fallback: number) {
	const value = Number.parseFloat(styles.getPropertyValue(property));
	return Number.isFinite(value) ? value : fallback;
}

export function getDocumentViewportMetrics() {
	if (typeof document === 'undefined') {
		return {
			top: DEFAULT_HEADER_HEIGHT + DEFAULT_VIEWPORT_GAP,
			gap: DEFAULT_VIEWPORT_GAP
		};
	}

	const styles = getComputedStyle(document.documentElement);
	const headerHeight = cssPixelValue(styles, '--app-header-height', DEFAULT_HEADER_HEIGHT);
	const gap = cssPixelValue(styles, '--document-viewport-gap', DEFAULT_VIEWPORT_GAP);
	return { top: headerHeight + gap, gap };
}
