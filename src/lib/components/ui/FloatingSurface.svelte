<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Placement } from '@floating-ui/dom';
	import { positionFloating, type FloatingAnchor } from './floating';
	import {
		getInteractionController,
		getInteractionOwner,
		setInteractionOwner,
		type CloseReason,
		type InteractionKind
	} from './interactions';
	const parentOwner = getInteractionOwner();

	let {
		open,
		anchor,
		trigger,
		onClose,
		placement = 'bottom-end',
		gap = 8,
		matchWidth = false,
		maxWidth,
		kind = 'surface',
		dismissOnFocus = false,
		referenceClipping = 'ignore',
		id,
		role,
		label,
		class: className = '',
		children,
		onReady,
		onkeydown,
		onpointerenter,
		onpointerleave,
		onpointerdown,
		element = $bindable()
	}: {
		open: boolean;
		anchor?: FloatingAnchor;
		trigger?: HTMLElement;
		onClose: (reason: CloseReason) => void;
		placement?: Placement;
		gap?: number;
		matchWidth?: boolean;
		maxWidth?: number;
		kind?: InteractionKind;
		dismissOnFocus?: boolean;
		referenceClipping?: 'ignore' | 'hide' | 'close';
		id?: string;
		role?: 'tooltip' | 'menu' | 'group';
		label?: string;
		class?: string;
		children: Snippet;
		onReady?: () => void;
		onkeydown?: (event: KeyboardEvent) => void;
		onpointerenter?: (event: PointerEvent) => void;
		onpointerleave?: (event: PointerEvent) => void;
		onpointerdown?: (event: PointerEvent) => void;
		element?: HTMLDivElement;
	} = $props();
	const controller = getInteractionController();
	const interactionId = Symbol('floating-surface');
	setInteractionOwner(interactionId);
	$effect(() => {
		const reference = anchor ?? trigger;
		if (!open || !element || !reference) return;
		const surface = element;
		const releaseInteraction = controller.register({
			id: interactionId,
			owner: parentOwner,
			kind,
			dismissOnFocus,
			visible: () => surface.checkVisibility({ visibilityProperty: true }),
			elements: () => [surface, trigger],
			close: (reason) => onClose(reason)
		});
		const releasePosition = positionFloating(surface, {
			anchor: reference,
			placement,
			gap,
			matchWidth,
			maxWidth,
			referenceClipping,
			close: (reason) => onClose(reason),
			onReady: () => onReady?.()
		});
		return () => {
			releasePosition();
			releaseInteraction();
		};
	});
	function nativeToggle() {
		if (open && element && !element.matches(':popover-open')) onClose('anchor-removal');
	}
</script>

<!-- Semantic wrappers supply the role and keyboard behavior. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	bind:this={element}
	popover="manual"
	{id}
	{role}
	aria-label={label}
	class={`box-border min-w-0 overflow-auto overscroll-contain ${className}`}
	ontoggle={nativeToggle}
	{onkeydown}
	{onpointerenter}
	{onpointerleave}
	{onpointerdown}
>
	{@render children()}
</div>
