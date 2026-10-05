import {
	autoUpdate,
	computePosition,
	flip,
	hide,
	offset,
	shift,
	size,
	type Placement,
	type VirtualElement
} from '@floating-ui/dom';
import type { CloseReason } from './interactions';
import { countOverlayWork } from '$lib/document/runtime/render-perf';

export type FloatingVirtualAnchor = VirtualElement & {
	subscribe?: (update: () => void) => () => void;
};
export type FloatingAnchor = HTMLElement | FloatingVirtualAnchor;
export interface FloatingOptions {
	anchor: FloatingAnchor;
	placement: Placement;
	gap: number;
	matchWidth: boolean;
	maxWidth?: number;
	referenceClipping: 'ignore' | 'hide' | 'close';
	close: (reason: CloseReason) => void;
	onReady?: () => void;
}

type AnchorWatch = { context: Element; update: () => void };
const anchorObservers = new WeakMap<
	Document,
	{
		observer: MutationObserver;
		watches: Set<AnchorWatch>;
	}
>();

/** One removal observer per document, active only while surfaces own references. */
function watchAnchor(context: Element, update: () => void) {
	const document = context.ownerDocument;
	let shared = anchorObservers.get(document);
	if (!shared) {
		const watches = new Set<AnchorWatch>();
		const observer = new MutationObserver((records) => {
			for (const watch of watches) {
				const affected = records.some((record) =>
					record.type === 'attributes'
						? record.oldValue !== (record.target as Element).getAttribute(record.attributeName!) &&
							record.target.contains(watch.context)
						: Array.from(record.removedNodes).some((node) => node.contains(watch.context))
				);
				if (affected) watch.update();
			}
		});
		observer.observe(document.body, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeOldValue: true,
			attributeFilter: ['disabled', 'hidden', 'class', 'style']
		});
		shared = { observer, watches };
		anchorObservers.set(document, shared);
	}
	const owner = shared;
	const watch = { context, update };
	owner.watches.add(watch);
	return () => {
		if (!owner.watches.delete(watch)) return;
		if (!owner.watches.size) {
			owner.observer.disconnect();
			anchorObservers.delete(document);
		}
	};
}

/** Native top-layer rendering keeps DOM ownership and fieldset inheritance intact. */
export function positionFloating(surface: HTMLElement, options: FloatingOptions) {
	const { anchor, close } = options;
	const context = anchor instanceof HTMLElement ? anchor : anchor.contextElement;
	let disposed = false;
	let ready = false;
	let revision = 0;
	let frame: number | undefined;
	Object.assign(surface.style, {
		position: 'fixed',
		inset: 'auto',
		margin: '0',
		visibility: 'hidden'
	});
	// Measure in the top layer while invisible, avoiding transformed/clipping ancestor geometry.
	surface.showPopover();

	function anchorUnavailable() {
		return (
			context &&
			(!context.isConnected || !context.getClientRects().length || context.matches(':disabled'))
		);
	}

	async function update() {
		if (disposed) return;
		countOverlayWork('floatingUpdates');
		const token = ++revision;
		if (anchorUnavailable()) {
			close('anchor-removal');
			return;
		}
		const viewport = { padding: 8, boundary: [] };
		const result = await computePosition(anchor, surface, {
			strategy: 'fixed',
			placement: options.placement,
			middleware: [
				offset(options.gap),
				flip(viewport),
				shift(viewport),
				size({
					...viewport,
					apply({ availableWidth, availableHeight, rects }) {
						if (disposed || token !== revision) return;
						surface.style.maxWidth = `${Math.max(0, Math.min(availableWidth, options.maxWidth ?? Infinity))}px`;
						surface.style.maxHeight = `${Math.max(0, availableHeight)}px`;
						surface.style.width = options.matchWidth
							? `${Math.min(rects.reference.width, availableWidth)}px`
							: 'max-content';
					}
				}),
				...(options.referenceClipping !== 'ignore' ? [hide({ strategy: 'referenceHidden' })] : [])
			]
		});
		if (disposed || token !== revision) return;
		if (result.middlewareData.hide?.referenceHidden) {
			surface.style.visibility = 'hidden';
			if (options.referenceClipping === 'close') close('anchor-removal');
			return;
		}
		Object.assign(surface.style, {
			left: `${result.x}px`,
			top: `${result.y}px`,
			visibility: 'visible'
		});
		if (!ready) {
			ready = true;
			options.onReady?.();
		}
	}

	function scheduleUpdate() {
		if (disposed || frame !== undefined) return;
		// Discard an in-flight position as soon as its reference changes.
		revision++;
		frame = requestAnimationFrame(() => {
			frame = undefined;
			void update();
		});
	}
	const release = autoUpdate(anchor, surface, scheduleUpdate, {
		animationFrame: false,
		// A selection reference moves through its subscription, not its document-sized context.
		layoutShift: anchor instanceof HTMLElement
	});
	const releaseAnchor =
		anchor instanceof HTMLElement ? undefined : anchor.subscribe?.(scheduleUpdate);
	const releaseRemoval = context
		? watchAnchor(context, () => {
				if (disposed) return;
				if (!context.isConnected || context.matches(':disabled')) {
					revision++;
					close('anchor-removal');
				} else scheduleUpdate();
			})
		: undefined;
	return () => {
		disposed = true;
		revision++;
		if (frame !== undefined) cancelAnimationFrame(frame);
		release();
		releaseAnchor?.();
		releaseRemoval?.();
		if (surface.matches(':popover-open')) surface.hidePopover();
	};
}
