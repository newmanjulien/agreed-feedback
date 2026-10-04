import type { AnnotationActivation } from '../annotation-anchor';
import type { DocumentHighlightController } from './controller';

const DRAG_DISTANCE = 5;

interface Gesture {
	pointerId: number;
	x: number;
	y: number;
	owner: HTMLElement;
	dragged: boolean;
}

export class DocumentClauseInteractions {
	#stage: HTMLElement;
	#highlights: DocumentHighlightController;
	#select: (itemId: string, annotationId: string, activation: AnnotationActivation) => void;
	#enabled = false;
	#pointer: { x: number; y: number } | null = null;
	#gesture: Gesture | null = null;
	#completedOwner: HTMLElement | null = null;
	#events = new AbortController();
	#unsubscribe: () => void;

	constructor(
		stage: HTMLElement,
		highlights: DocumentHighlightController,
		select: (itemId: string, annotationId: string, activation: AnnotationActivation) => void
	) {
		this.#stage = stage;
		this.#highlights = highlights;
		this.#select = select;
		const options = { signal: this.#events.signal };
		stage.addEventListener('pointerdown', this.#down, options);
		stage.addEventListener('pointermove', this.#hoverMove, options);
		stage.addEventListener('pointerleave', this.#leave, options);
		stage.addEventListener('click', this.#click, options);
		window.addEventListener('pointermove', this.#trackMovement, options);
		window.addEventListener('pointerup', this.#up, options);
		window.addEventListener('pointercancel', this.#cancel, options);
		window.addEventListener('blur', this.#cancel, options);
		stage.addEventListener('keydown', () => this.#resetGesture(), options);
		document.addEventListener('scroll', this.#scroll, { ...options, capture: true });
		this.#unsubscribe = highlights.subscribeGeometry((change) => {
			if (change === 'measure') this.#updateHover();
			else {
				this.#resetGesture();
				this.#setHover(null);
			}
		});
	}

	setEnabled(enabled: boolean) {
		this.#enabled = enabled;
		if (!enabled) this.#resetGesture();
		this.#updateHover();
	}

	#hit(x: number, y: number) {
		if (!this.#enabled) return null;
		// Ignore document regions obscured by a panel or other UI.
		const element = document.elementFromPoint(x, y);
		if (!element || !this.#stage.contains(element)) return null;
		const page = element.closest<HTMLElement>('.document-page');
		return page && this.#stage.contains(page) ? this.#highlights.hitTest(page, x, y) : null;
	}

	#setHover(owner: HTMLElement | null) {
		this.#highlights.setHoveredOwner(owner);
		this.#stage.toggleAttribute('data-clause-hover', !!owner);
	}

	#updateHover = () => {
		this.#setHover(this.#pointer ? this.#hit(this.#pointer.x, this.#pointer.y) : null);
	};

	#down = (event: PointerEvent) => {
		this.#resetGesture();
		if (!event.isPrimary || event.button !== 0) return;
		const owner = this.#hit(event.clientX, event.clientY);
		if (owner)
			this.#gesture = {
				pointerId: event.pointerId,
				x: event.clientX,
				y: event.clientY,
				owner,
				dragged: false
			};
		if (event.pointerType !== 'touch') {
			this.#pointer = { x: event.clientX, y: event.clientY };
			this.#updateHover();
		}
	};

	#trackMovement = (event: PointerEvent) => {
		const gesture = this.#gesture;
		if (
			gesture?.pointerId === event.pointerId &&
			Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > DRAG_DISTANCE
		)
			gesture.dragged = true;
	};

	#hoverMove = (event: PointerEvent) => {
		if (!event.isPrimary || event.pointerType === 'touch') return;
		this.#pointer = { x: event.clientX, y: event.clientY };
		this.#updateHover();
	};

	#up = (event: PointerEvent) => {
		this.#trackMovement(event);
		const gesture = this.#gesture;
		if (!gesture || gesture.pointerId !== event.pointerId) return;
		this.#gesture = null;
		this.#completedOwner =
			!gesture.dragged &&
			event.button === 0 &&
			this.#hit(event.clientX, event.clientY) === gesture.owner
				? gesture.owner
				: null;
	};

	#click = (event: MouseEvent) => {
		const owner =
			event.detail === 0
				? event.target instanceof Element
					? event.target.closest<HTMLElement>('.playbook-trigger')
					: null
				: this.#completedOwner;
		this.#resetGesture();
		if (
			!this.#enabled ||
			!owner?.isConnected ||
			!this.#stage.contains(owner) ||
			event.detail > 1 ||
			document.getSelection()?.isCollapsed === false
		)
			return;
		const { itemId, annotationId } = owner.dataset;
		if (itemId && annotationId)
			this.#select(itemId, annotationId, {
				owner,
				...(event.detail ? { clientX: event.clientX, clientY: event.clientY } : {})
			});
	};

	#resetGesture() {
		this.#gesture = null;
		this.#completedOwner = null;
	}

	#leave = () => {
		this.#pointer = null;
		this.#setHover(null);
	};

	#cancel = () => {
		this.#resetGesture();
		this.#leave();
	};

	#scroll = () => {
		this.#resetGesture();
		this.#updateHover();
	};

	destroy() {
		this.#events.abort();
		this.#unsubscribe();
		this.#cancel();
	}
}
