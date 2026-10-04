import {
	buildLineMaps,
	rangePageNumbers,
	selectedLineBounds,
	measureRanges,
	measureRevisions,
	measureTriggers,
	resolveOverlaps,
	type HighlightKind,
	type MeasuredInterval,
	type HighlightRect
} from './geometry';

type GeometryChange = 'invalidate' | 'measure';

const controllers = new WeakMap<HTMLElement, DocumentHighlightController>();

export function getDocumentHighlights(
	target: HTMLElement | undefined
): DocumentHighlightController | undefined {
	if (!target) return;
	const stage = target.matches('.document-stage')
		? target
		: (target.closest<HTMLElement>('.document-stage') ??
			target.querySelector<HTMLElement>('.document-stage'));
	return stage ? controllers.get(stage) : undefined;
}

type PageGeometry = ReturnType<typeof buildLineMaps>[number];
type PageRecord = {
	geometry: PageGeometry;
	triggers: MeasuredInterval[];
	revisions: MeasuredInterval[];
	groups: Map<string, Map<Range, MeasuredInterval[]>>;
};
type RangeRecord = { pages: readonly number[] };
type Group = { kind: HighlightKind; ranges: Map<Range, RangeRecord> };
export type PageHighlights = ReadonlyMap<number, readonly HighlightRect[]>;
export const EMPTY_HIGHLIGHTS: readonly HighlightRect[] = Object.freeze([]);

export class DocumentHighlightController {
	#stage: HTMLElement;
	#groups = new Map<string, Group>();
	#pages = new Map<number, PageRecord>();
	#publication: PageHighlights = new Map();
	#listeners = new Set<(pages: PageHighlights) => void>();
	#hoveredOwner: HTMLElement | null = null;
	#geometryListeners = new Set<(change: GeometryChange) => void>();
	#allGeometryDirty = true;
	#geometryDirty = new Set<number>();
	#paintDirty = new Set<number>();
	#selectionDirty = true;
	#nativeRanges: Range[] = [];
	#frame: number | undefined;
	#destroyed = false;
	#events = new AbortController();
	#resize: ResizeObserver;
	#mutations: MutationObserver;
	#observed = new Set<Element>();

	constructor(stage: HTMLElement) {
		this.#stage = stage;
		controllers.set(stage, this);
		const options = { signal: this.#events.signal };
		document.addEventListener('selectionchange', this.#selectionChanged, options);
		this.#resize = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const page = (entry.target as HTMLElement).closest<HTMLElement>('.document-page');
				if (page) this.#invalidatePages([Number(page.dataset.pageNumber)]);
			}
		});
		this.#mutations = new MutationObserver((records) => {
			const geometry = new Set<number>();
			for (const record of records) {
				const element =
					record.target instanceof Element ? record.target : record.target.parentElement;
				const page = element?.closest<HTMLElement>('.document-page');
				if (!page) continue;
				const number = Number(page.dataset.pageNumber);
				if (record.type === 'attributes') {
					if (record.oldValue === element?.getAttribute(record.attributeName!)) continue;
					if (record.attributeName === 'aria-pressed') {
						this.#paintDirty.add(number);
						continue;
					}
				}
				geometry.add(number);
			}
			if (geometry.size) this.#invalidatePages([...geometry]);
			else this.#schedule();
		});
		this.#observeContent();
		window.addEventListener('resize', this.invalidateLayout, options);
		document.fonts.addEventListener('loadingdone', this.invalidateLayout, options);
		void document.fonts.ready.then(() => {
			if (!this.#destroyed) this.invalidateLayout();
		});
		this.#schedule();
	}

	setGroup(name: string, kind: HighlightKind, ranges: readonly Range[]) {
		if (this.#destroyed) return;
		let group = this.#groups.get(name);
		if (group && group.kind !== kind) {
			this.clearGroup(name);
			group = undefined;
		}
		if (!group) this.#groups.set(name, (group = { kind, ranges: new Map() }));
		const next = new Set(
			ranges.filter(
				(range) =>
					this.#stage.contains(range.startContainer) && this.#stage.contains(range.endContainer)
			)
		);
		for (const [range, record] of group.ranges) {
			if (next.has(range)) continue;
			this.#removeRange(name, range, record.pages);
			group.ranges.delete(range);
		}
		for (const range of next) {
			const pages = rangePageNumbers(range),
				previous = group.ranges.get(range);
			if (
				previous &&
				pages.length === previous.pages.length &&
				pages.every((n, i) => n === previous.pages[i])
			)
				continue;
			if (previous) this.#removeRange(name, range, previous.pages);
			group.ranges.set(range, { pages });
			for (const number of pages) this.#addRange(number, name, kind, range);
		}
		this.#schedule();
	}
	#removeRange(name: string, range: Range, pages: readonly number[]) {
		for (const number of pages) {
			this.#pages.get(number)?.groups.get(name)?.delete(range);
			this.#paintDirty.add(number);
		}
	}
	#addRange(number: number, name: string, kind: HighlightKind, range: Range) {
		const page = this.#pages.get(number);
		if (page && !this.#allGeometryDirty && !this.#geometryDirty.has(number)) {
			let contributions = page.groups.get(name);
			if (!contributions) page.groups.set(name, (contributions = new Map()));
			contributions.set(range, measureRanges([page.geometry], [range], kind));
		}
		this.#paintDirty.add(number);
	}
	clearGroup(name: string) {
		const group = this.#groups.get(name);
		if (!group) return;
		for (const [range, record] of group.ranges) this.#removeRange(name, range, record.pages);
		this.#groups.delete(name);
		this.#schedule();
	}
	subscribe(listener: (pages: PageHighlights) => void) {
		this.#listeners.add(listener);
		listener(this.#publication);
		return () => {
			this.#listeners.delete(listener);
		};
	}
	hitTest(pageElement: HTMLElement, clientX: number, clientY: number): HTMLElement | null {
		const number = Number(pageElement.dataset.pageNumber),
			page = this.#pages.get(number);
		if (
			this.#destroyed ||
			this.#allGeometryDirty ||
			this.#geometryDirty.has(number) ||
			page?.geometry.element !== pageElement
		)
			return null;
		const bounds = pageElement.getBoundingClientRect(),
			scale = bounds.width / pageElement.offsetWidth;
		if (
			!scale ||
			clientX < bounds.left ||
			clientX >= bounds.right ||
			clientY < bounds.top ||
			clientY >= bounds.bottom
		)
			return null;
		const x = (clientX - bounds.left) / scale,
			y = (clientY - bounds.top) / scale;
		return (
			page.triggers.find(
				(interval) =>
					interval.owner?.isConnected &&
					x >= interval.left &&
					x < interval.right &&
					y >= interval.band.y &&
					y < interval.band.y + interval.band.height
			)?.owner ?? null
		);
	}
	setHoveredOwner(owner: HTMLElement | null) {
		if (this.#hoveredOwner === owner) return;
		for (const target of [this.#hoveredOwner, owner]) {
			const page = target?.closest<HTMLElement>('.document-page');
			if (page) this.#paintDirty.add(Number(page.dataset.pageNumber));
		}
		this.#hoveredOwner = owner;
		this.#schedule();
	}
	subscribeGeometry(listener: (change: GeometryChange) => void) {
		this.#geometryListeners.add(listener);
		return () => {
			this.#geometryListeners.delete(listener);
		};
	}
	#notifyGeometry(change: GeometryChange) {
		for (const listener of this.#geometryListeners) listener(change);
	}
	invalidateLayout = () => {
		if (this.#destroyed) return;
		this.#allGeometryDirty = true;
		this.#notifyGeometry('invalidate');
		this.#schedule();
	};
	#selectionChanged = () => {
		this.#selectionDirty = true;
		this.#schedule();
	};
	#measureSelection(ranges: Range[]) {
		const unchanged =
			ranges.length === this.#nativeRanges.length &&
			ranges.every((range, i) => {
				const cached = this.#nativeRanges[i];
				return (
					range.startContainer === cached.startContainer &&
					range.startOffset === cached.startOffset &&
					range.endContainer === cached.endContainer &&
					range.endOffset === cached.endOffset
				);
			});
		if (!unchanged) this.#nativeRanges = ranges.map((range) => range.cloneRange());
		this.setGroup('native-selection', 'native-selection', this.#nativeRanges);
		this.#selectionDirty = false;
	}
	finalLineBounds(ranges: Range[]) {
		if (this.#destroyed) return null;
		this.#ensureGeometry();
		this.#measureSelection(ranges);
		const intervals = [...this.#pages.values()]
			.sort((a, b) => a.geometry.number - b.geometry.number)
			.flatMap((page) => [...(page.groups.get('native-selection')?.values() ?? [])].flat());
		return selectedLineBounds(intervals);
	}
	contentCommitted(changedPages?: readonly number[]) {
		if (this.#destroyed) return;
		this.#observeContent();
		if (changedPages) this.#invalidatePages(changedPages);
		else this.invalidateLayout();
	}
	#invalidatePages(pages: readonly number[]) {
		if (this.#destroyed) return;
		for (const number of pages) this.#geometryDirty.add(number);
		this.#selectionDirty = true;
		this.#notifyGeometry('invalidate');
		this.#schedule();
	}
	#observeContent() {
		const contents = new Set(this.#stage.querySelectorAll('.document-page__content'));
		const removed = [...this.#observed].filter((content) => !contents.has(content));
		for (const content of removed) {
			this.#resize.unobserve(content);
			this.#observed.delete(content);
		}
		// MutationObserver cannot unobserve one target. Reconnect only when pages disappear.
		if (removed.length) this.#mutations.disconnect();
		for (const content of contents) {
			const added = !this.#observed.has(content);
			if (added) this.#resize.observe(content);
			if (added || removed.length)
				this.#mutations.observe(content, {
					subtree: true,
					childList: true,
					characterData: true,
					attributes: true,
					attributeOldValue: true,
					attributeFilter: ['aria-pressed', 'class', 'data-revision']
				});
			this.#observed.add(content);
		}
	}

	#ensureGeometry() {
		if (!this.#allGeometryDirty && !this.#geometryDirty.size) return;
		const updated = buildLineMaps(
			this.#stage,
			this.#allGeometryDirty ? undefined : this.#geometryDirty
		);
		for (const [number, page] of this.#pages) {
			if (
				this.#allGeometryDirty ||
				this.#geometryDirty.has(number) ||
				!page.geometry.element.isConnected
			) {
				this.#pages.delete(number);
				this.#paintDirty.add(number);
			}
		}
		for (const geometry of updated) {
			this.#pages.set(geometry.number, {
				geometry,
				triggers: measureTriggers([geometry]),
				revisions: measureRevisions([geometry]),
				groups: new Map()
			});
			this.#paintDirty.add(geometry.number);
		}
		this.#allGeometryDirty = false;
		this.#geometryDirty.clear();
		for (const [name, group] of this.#groups) {
			for (const [range, record] of group.ranges) {
				if (
					!this.#stage.contains(range.startContainer) ||
					!this.#stage.contains(range.endContainer)
				) {
					this.#removeRange(name, range, record.pages);
					group.ranges.delete(range);
					continue;
				}
				const pages = rangePageNumbers(range);
				if (pages.length !== record.pages.length || pages.some((n, i) => n !== record.pages[i])) {
					this.#removeRange(name, range, record.pages);
					record.pages = pages;
					for (const number of pages) this.#addRange(number, name, group.kind, range);
				} else {
					for (const geometry of updated)
						if (pages.includes(geometry.number))
							this.#addRange(geometry.number, name, group.kind, range);
				}
			}
		}
	}
	#schedule = () => {
		if (this.#destroyed || this.#frame !== undefined) return;
		this.#frame = requestAnimationFrame(() => {
			this.#ensureGeometry();
			this.#notifyGeometry('measure');
			if (this.#selectionDirty) {
				const selection = document.getSelection();
				this.#measureSelection(
					selection && !selection.isCollapsed
						? Array.from({ length: selection.rangeCount }, (_, i) => selection.getRangeAt(i))
						: []
				);
			}
			this.#frame = undefined;
			if (this.#paintDirty.size) {
				const publication = new Map(this.#publication);
				for (const number of this.#paintDirty) {
					const page = this.#pages.get(number);
					if (!page) {
						publication.delete(number);
						continue;
					}
					publication.set(
						number,
						resolveOverlaps(
							[
								...page.triggers,
								...page.revisions,
								...[...page.groups.values()].flatMap((ranges) => [...ranges.values()].flat())
							],
							this.#hoveredOwner
						)
					);
				}
				this.#paintDirty.clear();
				this.#publication = publication;
				for (const listener of this.#listeners) listener(publication);
			}
			this.#stage.setAttribute('data-highlights-ready', '');
		});
	};
	destroy() {
		this.#destroyed = true;
		if (this.#frame !== undefined) cancelAnimationFrame(this.#frame);
		this.#events.abort();
		this.#resize.disconnect();
		this.#mutations.disconnect();
		this.#observed.clear();
		this.#listeners.clear();
		this.#geometryListeners.clear();
		this.#groups.clear();
		this.#pages.clear();
		this.#nativeRanges = [];
		this.#publication = new Map();
		this.#hoveredOwner = null;
		controllers.delete(this.#stage);
		this.#stage.removeAttribute('data-highlights-ready');
	}
}
