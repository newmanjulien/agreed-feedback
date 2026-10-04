import { getDocumentHighlights, type DocumentHighlightController } from '../highlights/controller';
import type { PaginatedPage } from '../pagination/types';
import { DocumentSearchCache, DocumentSearchRanges } from './document-search';
import { getDocumentViewportMetrics } from '../document-viewport';
import type { DocumentSearchResult } from './types';

const ALL_MATCHES_HIGHLIGHT = 'agreed-search-matches';
const ACTIVE_MATCH_HIGHLIGHT = 'agreed-search-active-match';

export class DocumentSearchSession {
	query = $state('');
	results = $state.raw<DocumentSearchResult[]>([]);
	activeIndex = $state(-1);
	#controller: DocumentHighlightController | undefined;
	#cache = new DocumentSearchCache();
	#mounted = new DocumentSearchRanges();
	#pages: readonly PaginatedPage[] = [];
	#ranges: (Range | null)[] = [];
	setPages(pages: readonly PaginatedPage[]) {
		this.#pages = pages;
	}

	#target: HTMLElement | undefined;
	#panel: HTMLElement | undefined;

	setPanel(panel: HTMLElement | undefined) {
		this.#panel = panel;
	}

	get resultCount() {
		return this.results.length;
	}

	get activeResultNumber() {
		return this.activeIndex >= 0 ? this.activeIndex + 1 : 0;
	}

	setTarget(target: HTMLElement | undefined) {
		if (this.#target === target && this.#controller === getDocumentHighlights(target)) return;
		this.#clearHighlights();
		this.#mounted.reset();
		this.#ranges = [];
		this.#target = target;
		this.#controller = getDocumentHighlights(target);
	}

	setQuery(query: string) {
		this.query = query;
		this.refresh(true);
	}

	next() {
		if (!this.results.length) return;
		this.activeIndex = (this.activeIndex + 1) % this.results.length;
		this.#updateActiveHighlight();
		this.#scrollToActiveResult();
	}

	previous() {
		if (!this.results.length) return;
		this.activeIndex = (this.activeIndex - 1 + this.results.length) % this.results.length;
		this.#updateActiveHighlight();
		this.#scrollToActiveResult();
	}

	// Commits preserve unchanged ranges and never move the viewport; query edits may scroll.
	refresh(scrollToFirst = false) {
		const activeResult = this.results[this.activeIndex];
		const controller = getDocumentHighlights(this.#target);
		if (controller !== this.#controller) {
			this.#clearHighlights();
			this.#controller = controller;
		}
		this.results = this.#target ? this.#cache.search(this.#pages, this.query) : [];
		this.#ranges = this.#target ? this.#mounted.materialize(this.#target, this.results) : [];
		const retainedIndex = this.results.indexOf(activeResult);
		if (scrollToFirst) this.activeIndex = 0;
		else if (retainedIndex >= 0) this.activeIndex = retainedIndex;
		this.activeIndex = Math.min(Math.max(this.activeIndex, 0), this.results.length - 1);
		this.#controller?.setGroup(
			ALL_MATCHES_HIGHLIGHT,
			'search-match',
			this.#ranges.filter((range): range is Range => range !== null)
		);
		this.#updateActiveHighlight();
		if (scrollToFirst && this.results.length) this.#scrollToActiveResult();
	}

	clear() {
		this.#cache.reset();
		this.#mounted.reset();
		this.query = '';
		this.results = [];
		this.#ranges = [];
		this.activeIndex = -1;
		this.#clearHighlights();
	}

	destroy() {
		this.#target = undefined;
		this.#pages = [];
		this.#panel = undefined;
		this.clear();
		this.#controller = undefined;
	}

	#clearHighlights() {
		this.#controller?.clearGroup(ALL_MATCHES_HIGHLIGHT);
		this.#controller?.clearGroup(ACTIVE_MATCH_HIGHLIGHT);
	}

	#updateActiveHighlight() {
		const activeResult = this.#ranges[this.activeIndex];
		this.#controller?.setGroup(
			ACTIVE_MATCH_HIGHLIGHT,
			'search-active',
			activeResult ? [activeResult] : []
		);
	}

	#scrollToActiveResult() {
		if (typeof window === 'undefined') return;
		const activeResult = this.#ranges[this.activeIndex];
		if (!activeResult) return;

		const rects = Array.from(activeResult.getClientRects());
		const rect = rects.find((candidate) => candidate.width > 0 || candidate.height > 0);
		if (!rect) return;

		const searchPanelBottom = this.#panel?.getBoundingClientRect().bottom ?? 0;
		const viewportTop = Math.max(getDocumentViewportMetrics().top, searchPanelBottom + 16);
		const viewportBottom = window.innerHeight - 24;
		if (rect.top >= viewportTop && rect.bottom <= viewportBottom) return;

		const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		window.scrollBy({
			top: rect.top - (viewportTop + viewportBottom) / 2,
			behavior: reducedMotion ? 'auto' : 'smooth'
		});
	}
}
