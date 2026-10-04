// Browsers expose no standard multi-click interval. Slow OS settings may exceed this window.
const CLICK_SETTLE_MS = 100;
const DRAG_DISTANCE_PX = 4;
const NAVIGATION_KEYS = new Set([
	'ArrowLeft',
	'ArrowRight',
	'ArrowUp',
	'ArrowDown',
	'Home',
	'End',
	'PageUp',
	'PageDown'
]);

type Phase = 'idle' | 'selecting' | 'settling';

/** Tracks user gestures only; selection mapping and acceptance belong to the caller. */
export function createSelectionGesture({
	getContainer,
	onSelectionUpdate,
	onGestureStart,
	onComplete,
	onCancel
}: {
	getContainer: () => HTMLElement | undefined;
	onSelectionUpdate: () => void;
	onGestureStart: () => void;
	onComplete: () => void;
	onCancel: () => void;
}) {
	let phase: Phase = 'idle';
	let generation = 0;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let frame: number | null = null;
	let pointer: { id: number; x: number; y: number; dragged: boolean } | null = null;
	const activeKeys = new Set<string>();
	const listeners = new AbortController();
	const options = { signal: listeners.signal };

	function reset() {
		generation++;
		if (timer !== null) clearTimeout(timer);
		if (frame !== null) cancelAnimationFrame(frame);
		timer = null;
		frame = null;
		pointer = null;
		activeKeys.clear();
		phase = 'idle';
	}

	function cancel() {
		reset();
		onCancel();
	}

	function start() {
		reset();
		phase = 'selecting';
		onGestureStart();
	}

	function settle(click: boolean) {
		phase = 'settling';
		const token = generation;
		const complete = () => {
			if (token !== generation || phase !== 'settling') return;
			// Consume completion before callbacks can clear the selection or start another gesture.
			reset();
			onComplete();
		};
		if (click) timer = setTimeout(complete, CLICK_SETTLE_MS);
		else frame = requestAnimationFrame(complete);
		onSelectionUpdate();
	}

	function inside(target: EventTarget | null) {
		return target instanceof Node && Boolean(getContainer()?.contains(target));
	}

	function selectionBelongsToDocument() {
		const selection = window.getSelection();
		return Boolean(selection && inside(selection.anchorNode) && inside(selection.focusNode));
	}

	function pointerDown(event: PointerEvent) {
		if (event.defaultPrevented) {
			reset();
			return;
		}
		if (!inside(event.target)) {
			cancel();
			return;
		}
		if (!event.isPrimary || event.button !== 0) {
			reset();
			return;
		}
		start();
		pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, dragged: false };
	}

	function pointerMove(event: PointerEvent) {
		if (!pointer || event.pointerId !== pointer.id) return;
		if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > DRAG_DISTANCE_PX)
			pointer.dragged = true;
	}

	function pointerUp(event: PointerEvent) {
		if (!pointer || event.pointerId !== pointer.id) return;
		pointerMove(event);
		const click = !pointer.dragged;
		pointer = null;
		settle(click);
	}

	function keyDown(event: KeyboardEvent) {
		if (event.defaultPrevented || document.querySelector('dialog:modal')) return;
		if (
			pointer ||
			!event.shiftKey ||
			!NAVIGATION_KEYS.has(event.key) ||
			!inside(event.target) ||
			!selectionBelongsToDocument()
		)
			return;
		if (phase !== 'selecting') start();
		activeKeys.add(event.key);
	}

	function keyUp(event: KeyboardEvent) {
		if (phase !== 'selecting' || pointer || activeKeys.size === 0) return;
		activeKeys.delete(event.key);
		if (event.key === 'Shift' || !event.shiftKey || activeKeys.size === 0) {
			activeKeys.clear();
			settle(false);
		}
	}

	document.addEventListener('pointerdown', pointerDown, options);
	window.addEventListener('pointermove', pointerMove, options);
	window.addEventListener('pointerup', pointerUp, options);
	window.addEventListener('pointercancel', cancel, options);
	document.addEventListener('keydown', keyDown, options);
	document.addEventListener('keyup', keyUp, options);
	document.addEventListener('selectionchange', onSelectionUpdate, options);
	document.addEventListener(
		'focusin',
		(event) => {
			if (!inside(event.target)) reset();
		},
		options
	);
	document.addEventListener(
		'focusout',
		(event) => {
			if (inside(event.target) && !inside(event.relatedTarget)) reset();
		},
		options
	);
	window.addEventListener('blur', cancel, options);

	return {
		get selecting() {
			return phase === 'selecting';
		},
		reset,
		destroy() {
			reset();
			listeners.abort();
		}
	};
}
