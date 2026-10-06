<script lang="ts">
	import { getAnnotationRegistry } from '$lib/document/annotation-registry';
	import type { InlineToken } from '$lib/document/pagination/types';
	import { annotationSegment, type AnnotationSegment } from '$lib/playbook/document-overlay';
	import type { AnnotationActivation } from '$lib/document/annotation-anchor';
	import RevisionText from './RevisionText.svelte';
	import { protectedInteraction } from '$lib/components/ui/interactions';
	const protect = protectedInteraction();

	const registry = getAnnotationRegistry();
	function registerOwner(owner: HTMLElement, memberships: readonly string[]) {
		let release = registry?.register(owner, memberships);
		return {
			update(next: readonly string[]) {
				release?.();
				release = registry?.register(owner, next);
			},
			destroy() {
				release?.();
			}
		};
	}

	interface Segment extends AnnotationSegment {
		tokens: InlineToken[];
	}

	let {
		tokens,
		profileMode = false,
		interactive = true,
		selectedAnnotationId,
		canOpenPlaybookItems,
		onAnnotationSelect
	}: {
		tokens: readonly InlineToken[];
		profileMode?: boolean;
		interactive?: boolean;
		selectedAnnotationId: string | null;
		canOpenPlaybookItems: boolean;
		onAnnotationSelect: (
			itemId: string,
			annotationId: string,
			activation: AnnotationActivation
		) => void;
	} = $props();

	function segmentTokensByAnnotation(items: readonly InlineToken[]): Segment[] {
		const segments: Segment[] = [];
		for (const token of items) {
			const descriptor = annotationSegment(token.annotations);
			const previous = segments.at(-1);
			if (previous && previous.membershipKey === descriptor.membershipKey)
				previous.tokens.push(token);
			else segments.push({ ...descriptor, tokens: [token] });
		}
		return segments;
	}

	function handleKeydown(event: KeyboardEvent, itemId: string, annotationId: string) {
		if (!canOpenPlaybookItems || (event.key !== 'Enter' && event.key !== ' ')) return;
		event.preventDefault();
		if (event.repeat) return;
		onAnnotationSelect(itemId, annotationId, { owner: event.currentTarget as HTMLElement });
	}

	let segments = $derived(segmentTokensByAnnotation(tokens));
</script>

{#each segments as segment}
	{#if segment.target}
		<!-- Role and tabindex change together; keep the text nodes stable for search ranges. -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<span
			use:protect={interactive && !profileMode}
			use:registerOwner={interactive && !profileMode ? segment.membershipIds : []}
			class="playbook-trigger"
			role={canOpenPlaybookItems ? 'button' : undefined}
			tabindex={canOpenPlaybookItems ? 0 : undefined}
			aria-label={canOpenPlaybookItems && segment.tokens.every((token) => !token.value.trim())
				? 'Open playbook item'
				: undefined}
			aria-pressed={canOpenPlaybookItems
				? selectedAnnotationId !== null && segment.membershipIds.includes(selectedAnnotationId)
				: undefined}
			data-item-id={profileMode ? undefined : segment.target.itemId}
			data-annotation-id={profileMode ? undefined : segment.target.id}
			data-annotation-memberships={profileMode ? undefined : JSON.stringify(segment.membershipIds)}
			onkeydown={interactive && !profileMode
				? (event) => handleKeydown(event, segment.target!.itemId, segment.target!.id)
				: undefined}
		>
			<RevisionText tokens={segment.tokens} {profileMode} />
		</span>
	{:else}
		<RevisionText tokens={segment.tokens} {profileMode} />
	{/if}
{/each}
