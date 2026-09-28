import {
	clearCustomHighlights,
	customHighlightsSupported,
	setCustomHighlight
} from '../custom-highlights';
import { searchDocument } from './document-search';
import { getDocumentViewportMetrics } from '../document-viewport';
import type { DocumentSearchResult } from './types';

const ALL_MATCHES_HIGHLIGHT = 'agreed-search-matches';
const ACTIVE_MATCH_HIGHLIGHT = 'agreed-search-active-match';

function renderHighlights(ranges: Range[] = [], active?: Range) {
	clearCustomHighlights(ALL_MATCHES_HIGHLIGHT, ACTIVE_MATCH_HIGHLIGHT);
	setCustomHighlight(ALL_MATCHES_HIGHLIGHT, ranges, 0);
	if (active) setCustomHighlight(ACTIVE_MATCH_HIGHLIGHT, [active], 1);
}

export class DocumentSearchSession {
	query = $state('');
	results = $state<DocumentSearchResult[]>([]);
	activeIndex = $state(-1);
	supported = $state(true);

	#target: HTMLElement | undefined;
	#observer: MutationObserver | undefined;
	#refreshQueued = false;

	get resultCount() {
		return this.results.length;
	}

	get activeResultNumber() {
		return this.activeIndex >= 0 ? this.activeIndex + 1 : 0;
	}

	setTarget(target: HTMLElement | undefined) {
		if (target === this.#target) return;

		this.#observer?.disconnect();
		this.#observer = undefined;
		this.#target = target;
		this.supported = customHighlightsSupported();
		this.refresh(false);

		if (!target || typeof MutationObserver === 'undefined') return;
		this.#observer = new MutationObserver(() => this.#scheduleRefresh());
		this.#observer.observe(target, {
			childList: true,
			characterData: true,
			subtree: true
		});
	}

	setQuery(query: string) {
		this.query = query;
		this.refresh(true);
	}

	next() {
		if (!this.results.length) return;
		this.activeIndex = (this.activeIndex + 1) % this.results.length;
		this.#updateHighlights();
		this.#scrollToActiveResult();
	}

	previous() {
		if (!this.results.length) return;
		this.activeIndex = (this.activeIndex - 1 + this.results.length) % this.results.length;
		this.#updateHighlights();
		this.#scrollToActiveResult();
	}

	refresh(resetActive: boolean) {
		const previousIndex = this.activeIndex;
		this.results = this.#target ? searchDocument(this.#target, this.query) : [];

		if (!this.results.length) {
			this.activeIndex = -1;
		} else if (resetActive) {
			this.activeIndex = 0;
		} else {
			this.activeIndex = Math.min(Math.max(previousIndex, 0), this.results.length - 1);
		}

		this.#updateHighlights();
		if (resetActive && this.results.length) this.#scrollToActiveResult();
	}

	clear() {
		this.query = '';
		this.results = [];
		this.activeIndex = -1;
		this.#clearHighlights();
	}

	destroy() {
		this.#observer?.disconnect();
		this.#observer = undefined;
		this.#target = undefined;
		this.clear();
	}

	#scheduleRefresh() {
		if (this.#refreshQueued) return;
		this.#refreshQueued = true;

		queueMicrotask(() => {
			this.#refreshQueued = false;
			this.refresh(false);
		});
	}

	#clearHighlights() {
		renderHighlights();
	}

	#updateHighlights() {
		const activeResult = this.results[this.activeIndex];
		renderHighlights(
			this.results.map((result) => result.range),
			activeResult?.range
		);
	}

	#scrollToActiveResult() {
		if (typeof window === 'undefined') return;
		const activeResult = this.results[this.activeIndex];
		if (!activeResult) return;

		const rects = Array.from(activeResult.range.getClientRects());
		const rect = rects.find((candidate) => candidate.width > 0 || candidate.height > 0);
		if (!rect) return;

		const searchPanelBottom =
			document.querySelector<HTMLElement>('[data-utility-panel="search"]')?.getBoundingClientRect()
				.bottom ?? 0;
		const viewportTop = Math.max(getDocumentViewportMetrics().top, searchPanelBottom + 16);
		const viewportBottom = window.innerHeight - 24;
		if (rect.top >= viewportTop && rect.bottom <= viewportBottom) return;

		const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		window.scrollBy({
			top: rect.top - window.innerHeight / 2,
			behavior: reducedMotion ? 'auto' : 'smooth'
		});
	}
}
