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

export type FloatingAnchor = HTMLElement | VirtualElement;
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

/** Native top-layer rendering keeps DOM ownership and fieldset inheritance intact. */
export function positionFloating(surface: HTMLElement, options: FloatingOptions) {
	const { anchor, close } = options;
	const context = anchor instanceof HTMLElement ? anchor : anchor.contextElement;
	let disposed = false;
	let ready = false;
	let revision = 0;
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

	const release = autoUpdate(anchor, surface, () => void update(), { animationFrame: true });
	// Removal and inherited disabled state can change without moving the reference.
	const observer = new MutationObserver(() => {
		if (!disposed && anchorUnavailable()) {
			revision++;
			close('anchor-removal');
		}
	});
	if (context)
		observer.observe(document.body, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ['disabled']
		});
	return () => {
		disposed = true;
		revision++;
		release();
		observer.disconnect();
		if (surface.matches(':popover-open')) surface.hidePopover();
	};
}
