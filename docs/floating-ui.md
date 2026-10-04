# Floating UI and interaction ownership

The persistent app layout creates one `InteractionController`. Floating surfaces,
workspace panels, and search register with it; feature components do not add document
listeners for outside pointers, focus dismissal, or Escape. The controller requests
closure with a reason. Authoring still decides whether a clean, dirty, new, or unresolved
box can close, as described in [lifecycle.md](lifecycle.md). Nothing in this layer saves.

`FloatingSurface` uses a manual native popover in the browser top layer. It stays in its
logical DOM location, preserving Svelte context and disabled fieldsets. Do not add a
portal, local z-index fix, or absolute floating coordinates. Native modal dialogs keep
`showModal()`; opening Help closes transient surfaces, and a modal blocks workspace
dismissal and shortcuts.

`floating.ts` is the only positioning implementation. Floating UI measures the invisible
top-layer surface before revealing it, uses fixed coordinates, applies an offset, flips
and shifts with 8px viewport padding, and constrains available width and height. Large
surfaces scroll internally. Its updates track scroll, resize, content size, and moving
anchors; closing or unmounting releases all observers. An element or a virtual anchor
with a `contextElement` is supported. Removed or disabled anchors close their surfaces.
Tooltips close when their reference is clipped. Selection actions hide while clipped,
keeping accepted native endpoints so scrolling back restores the actions.

## Adding an interaction

Use `Tooltip` for supplementary text, `Menu` for actions, and `Popover` for ordinary
interactive controls. Each has its own semantics and focus behavior:

- `Tooltip` shows on hover or keyboard focus, allows hovering its content, and never
  focuses its content. The standalone info button also toggles on touch. A custom
  trigger receives the snippet's description ID for `aria-describedby` and supplies
  its element reference. Escape suppresses reopening until activation ends.
- `Menu` focuses the first enabled `role="menuitem"` button and handles arrows,
  Home/End, and native Enter/Space activation. Call the child snippet's `activate`
  callback when completing an action. Tab dismisses after normal focus traversal.
- `Popover` contains normal controls, such as checkboxes. Pass `keyboard` when opened
  by keyboard to focus its first enabled control; pointer opening leaves trigger focus
  intact. Changes inside it do not dismiss it.

Both interactive components restore the available trigger after Escape or activation.
Outside pointers and focus leaving dismiss without preventing the clicked action or
redirecting focus. Preferred placements are below-end for tooltips and menus, and
below-start with trigger-width matching for options popovers.

A workspace sets an owner symbol through `setInteractionOwner`. `BoxDismissal`
registers that symbol as a panel. Descendant floating surfaces inherit ownership;
`FloatingSurface` provides its own symbol for nested surfaces, which open above their
parent. Its optional `owner` and `boundaries` props handle explicit relationships.
Use the `protectedInteraction()` action on real interaction boundaries such as the
workspace panel, annotation triggers, search, and utility controls. Source picking
also registers the document stage as protected. Pointer interactions with descendants
count as inside their owners, even when those descendants render in the top layer.
Protected boundaries inherit through the same ownership chain.

Escape closes a visible tooltip first, then the most recently active interactive
surface or search, then the owning panel on a subsequent press. Hidden selection
surfaces do not consume Escape. Dirty-draft and staged-creation safeguards remain in
`AuthoringFlow`. Registration cleanup closes descendants when their owner disappears;
the persistent dispatcher is released with the app layout.
