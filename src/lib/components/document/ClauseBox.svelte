<script lang="ts">
	import CaretDownIcon from 'phosphor-svelte/lib/CaretDownIcon';
	import InfoIcon from 'phosphor-svelte/lib/InfoIcon';
	import DotsThreeVerticalIcon from 'phosphor-svelte/lib/DotsThreeVerticalIcon';
	import XIcon from 'phosphor-svelte/lib/XIcon';
	import { tick } from 'svelte';
	import SquareIconButton from '$lib/components/ui/SquareIconButton.svelte';
	import Checkbox from '$lib/components/ui/Checkbox.svelte';
	import Tooltip from '$lib/components/ui/Tooltip.svelte';
	import type { ClauseBoxRecord, EditableCopyKey } from '$lib/contract/model';
	import type { Id } from '../../../convex/_generated/dataModel';
	import { displayParagraphs } from '$lib/contract/copy';
	import { CLAUSE_BOX_TEXT_SECTIONS, CLAUSE_BOX_CONCESSION_SECTIONS } from './clause-box-config';

	let {
		box,
		adminMode = false,
		deleting = false,
		undoPending = false,
		textDrafts = {},
		tooltipOverride,
		updateTextDraft,
		updateTooltipOverride,
		onBlurTextDraft,
		selectedConcessionByClause,
		onToggleConcession,
		onDelete,
		onDismiss,
		element = $bindable()
	}: {
		box: ClauseBoxRecord;
		adminMode?: boolean;
		deleting?: boolean;
		undoPending?: boolean;
		textDrafts?: Partial<Record<EditableCopyKey, string>>;
		tooltipOverride?: boolean;
		updateTextDraft: (id: Id<'clauseBoxes'>, sectionKey: EditableCopyKey, value: string) => void;
		updateTooltipOverride: (id: Id<'clauseBoxes'>, value: boolean) => void;
		onBlurTextDraft: (id: Id<'clauseBoxes'>, sectionKey: EditableCopyKey) => void;
		selectedConcessionByClause: Readonly<Record<string, string>>;
		onToggleConcession: (clauseKey: string, concessionKey: string) => void;
		onDelete: (id: Id<'clauseBoxes'>) => void;
		onDismiss: () => void;
		element?: HTMLElement;
	} = $props();
	let clauseKey = $derived(box.clauseKey);

	type Section =
		| (typeof CLAUSE_BOX_TEXT_SECTIONS)[number]['key']
		| (typeof CLAUSE_BOX_CONCESSION_SECTIONS)[number]['key'];

	let openSection = $state<Section | null>(null);
	let menuOpen = $state(false);
	let menuContainer = $state<HTMLDivElement>();
	let menuButton = $state<HTMLButtonElement>();
	let deleteButton = $state<HTMLButtonElement>();
	let menuId = $derived(`clause-box-${clauseKey}-menu`);

	async function toggleMenu() {
		if (deleting) return;
		menuOpen = !menuOpen;
		if (menuOpen) {
			await tick();
			deleteButton?.focus();
		}
	}

	function requestDelete() {
		if (
			deleting ||
			undoPending ||
			!window.confirm(
				'Delete this clause box? A successful deletion can be undone from the header.'
			)
		)
			return;
		menuOpen = false;
		onDelete(box.id);
	}

	function handleOutsidePointerDown(event: PointerEvent) {
		if (menuOpen && !menuContainer?.contains(event.target as Node)) menuOpen = false;
	}

	function handleOutsideFocus(event: FocusEvent) {
		if (menuOpen && !menuContainer?.contains(event.target as Node)) menuOpen = false;
	}

	function handleMenuKeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape' || !menuOpen) return;
		event.preventDefault();
		event.stopPropagation();
		menuOpen = false;
		menuButton?.focus();
	}
	const editorClass =
		'min-h-28 w-full resize-y rounded-field border border-line bg-surface px-3 py-2 text-[15px] leading-[1.45] text-ink placeholder:text-ink-muted focus:border-accent focus:outline-2 focus:outline-offset-1 focus:outline-accent/18';
	const textSections = $derived(
		CLAUSE_BOX_TEXT_SECTIONS.flatMap(({ key, label, placeholder }) => {
			const body = box[key];
			return adminMode || body.trim() ? [{ key, label, placeholder, body, initialText: body }] : [];
		})
	);
	const preferredTooltipEnabled = $derived(
		adminMode && tooltipOverride !== undefined
			? tooltipOverride
			: box.showPreferredConcessionsInfoTooltip
	);
	const concessionSections = $derived(
		CLAUSE_BOX_CONCESSION_SECTIONS.flatMap(({ key, label, tone }) => {
			const section = box[key];
			if (!section.length) return [];

			return [
				{
					key,
					label,
					tone,
					items: section,
					showInfoTooltip: key === 'preferredConcessions' && preferredTooltipEnabled
				}
			];
		})
	);
	const hasContent = $derived(Boolean(textSections.length || concessionSections.length));

	function toggleSection(section: Section) {
		openSection = openSection === section ? null : section;
	}
</script>

<svelte:document onpointerdown={handleOutsidePointerDown} onfocusin={handleOutsideFocus} />

<aside
	class="clause-box w-full rounded-box border border-line bg-surface p-3.5 text-ink shadow-none"
	class:has-content={hasContent}
	bind:this={element}
	data-clause-box
>
	{#if adminMode}
		<div class="admin-clause-header flex items-center justify-between gap-3">
			<span class="text-[15px] font-medium text-ink-muted">Edit the guidance your reps see</span>
			<div class="relative" bind:this={menuContainer}>
				<SquareIconButton
					size="sm"
					type="button"
					aria-label="Clause box options"
					disabled={deleting}
					aria-haspopup="menu"
					aria-expanded={menuOpen}
					aria-controls={menuId}
					onclick={toggleMenu}
					onkeydown={handleMenuKeydown}
					bind:element={menuButton}
				>
					<DotsThreeVerticalIcon aria-hidden="true" size={19} weight="bold" />
				</SquareIconButton>
				{#if menuOpen}
					<div
						id={menuId}
						role="menu"
						aria-label="Clause box options"
						class="absolute top-full right-0 z-10 min-w-36 rounded-panel border border-line bg-surface p-1 shadow-md"
					>
						<button
							bind:this={deleteButton}
							disabled={deleting || undoPending}
							type="button"
							role="menuitem"
							class="w-full cursor-pointer rounded-control border-0 bg-transparent px-3 py-2 text-left text-[14px] text-danger hover:bg-danger-surface focus-visible:bg-danger-surface focus-visible:outline-2 focus-visible:outline-accent"
							onkeydown={handleMenuKeydown}
							onclick={requestDelete}>Delete box</button
						>
					</div>
				{/if}
			</div>
		</div>
	{/if}
	<header class="clause-box-header">
		<div class="clause-box-summary min-w-0 text-[15px] leading-[1.45] text-ink-muted">
			{#if adminMode}
				<textarea
					class={editorClass}
					aria-label="Summary for this clause"
					placeholder="Write a summary for this clause"
					value={textDrafts.summary ?? box.summary}
					disabled={deleting || undoPending}
					onblur={() => onBlurTextDraft(box.id, 'summary')}
					oninput={(event) => updateTextDraft(box.id, 'summary', event.currentTarget.value)}
				></textarea>
			{:else}
				{#each displayParagraphs(box.summary) as paragraph}
					<p class="m-0">{paragraph}</p>
				{/each}
			{/if}
		</div>
		<div class="clause-box-close">
			<SquareIconButton type="button" aria-label="Close clause box" onclick={onDismiss}>
				<XIcon aria-hidden="true" size={22} weight="regular" />
			</SquareIconButton>
		</div>
	</header>

	{#if hasContent}
		<div class="clause-box-body flex flex-col gap-2">
			{#each textSections as section (section.key)}
				{@const answerId = `clause-box-${clauseKey}-${section.key}`}
				<div>
					<button
						class="flex w-full cursor-pointer items-center justify-between gap-2 rounded-panel border-0 bg-canvas px-3 py-2.5 text-left text-[15px] leading-[1.3] text-ink hover:bg-hover-subtle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
						type="button"
						aria-expanded={openSection === section.key}
						aria-controls={answerId}
						onclick={() => toggleSection(section.key)}
					>
						<span>{section.label}</span>
						<CaretDownIcon
							aria-hidden="true"
							size={14}
							weight="bold"
							class="shrink-0 text-ink-subtle/30"
						/>
					</button>
					<div
						id={answerId}
						class="mt-2 mb-1 flex flex-col gap-3 px-1 text-[15px] leading-[1.45] text-ink-subtle"
						hidden={openSection !== section.key}
					>
						{#if adminMode}
							<textarea
								class={editorClass}
								aria-label={`${section.label} for this clause`}
								placeholder={section.placeholder}
								value={textDrafts[section.key] ?? section.initialText}
								disabled={deleting || undoPending}
								onblur={() => onBlurTextDraft(box.id, section.key)}
								oninput={(event) => updateTextDraft(box.id, section.key, event.currentTarget.value)}
							></textarea>
						{:else}
							{#each displayParagraphs(section.body) as paragraph}
								<p class="m-0">{paragraph}</p>
							{/each}
						{/if}
					</div>
				</div>
			{/each}

			{#each concessionSections as section (section.key)}
				{@const answerId = `clause-box-${clauseKey}-${section.key}`}
				{@const labelId = `${answerId}-label`}
				<div>
					<div
						class={`relative flex w-full cursor-pointer items-center gap-2 rounded-panel px-3 py-2.5 text-[15px] leading-[1.3] ${section.tone === 'danger' ? 'bg-danger-surface text-danger hover:bg-danger-surface-hover' : 'bg-canvas text-ink hover:bg-hover-subtle'}`}
					>
						<button
							class="absolute inset-0 z-0 cursor-pointer rounded-panel border-0 bg-transparent p-0 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
							type="button"
							aria-labelledby={labelId}
							aria-expanded={openSection === section.key}
							aria-controls={answerId}
							onclick={() => toggleSection(section.key)}
						></button>
						<div class="pointer-events-none relative z-10 flex min-w-0 flex-1 items-center gap-1.5">
							<span id={labelId}
								>{section.label} {section.items.length === 1 ? 'concession' : 'concessions'}</span
							>
							{#if section.showInfoTooltip}
								<span class="pointer-events-auto inline-flex">
									<Tooltip text="It’s important to negotiate this clause">
										<InfoIcon aria-hidden="true" size={18} weight="regular" class="text-accent" />
									</Tooltip>
								</span>
							{/if}
						</div>
						<CaretDownIcon
							aria-hidden="true"
							size={14}
							weight="bold"
							class={`pointer-events-none relative z-10 ml-auto shrink-0 ${section.tone === 'danger' ? 'text-danger/30' : 'text-ink-subtle/30'}`}
						/>
					</div>
					<div
						id={answerId}
						class={`mt-2 mb-1 flex flex-col gap-3 px-1 text-[15px] leading-[1.45] text-ink-subtle`}
						hidden={openSection !== section.key}
					>
						{#if adminMode && section.key === 'preferredConcessions'}
							<Checkbox
								label="Show info tooltip"
								checked={preferredTooltipEnabled}
								disabled={deleting || undoPending}
								onCheckedChange={(checked) => updateTooltipOverride(box.id, checked)}
							/>
						{/if}
						{#each section.items as item, itemIndex (item.concessionKey)}
							{@const applied = selectedConcessionByClause[clauseKey] === item.concessionKey}
							{@const actionText = applied ? 'Remove concession' : 'Apply concession'}
							{@const descriptionBeforeId = `${answerId}-${item.concessionKey}-description-before`}
							{#snippet concessionAction(descriptionId: string)}
								<button
									type="button"
									disabled={deleting}
									aria-label={section.items.length > 1
										? `${actionText} ${itemIndex + 1} of ${section.items.length}`
										: undefined}
									aria-describedby={descriptionId}
									class="cursor-pointer whitespace-nowrap border-0 bg-transparent p-0 [font:inherit] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-default disabled:opacity-50 disabled:hover:no-underline"
									class:text-danger={applied}
									class:text-accent={!applied}
									onclick={() => onToggleConcession(clauseKey, item.concessionKey)}
									>{actionText}</button
								>
							{/snippet}

							{@const paragraphAfterId = `${answerId}-${item.concessionKey}-description-after`}
							{@const paragraphDescriptionId =
								item.copy.after === undefined
									? descriptionBeforeId
									: `${descriptionBeforeId} ${paragraphAfterId}`}
							<p class="m-0">
								<span id={descriptionBeforeId}>{item.copy.before}</span>{' '}
								{@render concessionAction(paragraphDescriptionId)}
								{#if item.copy.after !== undefined}
									{'\u00A0'}<span id={paragraphAfterId} class="italic">{item.copy.after}</span>
								{/if}
							</p>
							{#each item.copy.detail as paragraph}
								<p class="m-0">{paragraph}</p>
							{/each}
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</aside>

<style>
	.admin-clause-header {
		margin-bottom: 10px;
	}
	.has-content .clause-box-header {
		margin-bottom: 12px;
	}
	.clause-box-summary {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.clause-box-close {
		display: none;
	}
	/* Keep this threshold in sync with SIDE_BOX_BREAKPOINT and ContractWorkspaceLayout. */
	@container (width < 1150px) {
		.admin-clause-header {
			margin-bottom: 0;
			padding: 12px 14px 0;
		}
		.admin-clause-header + .clause-box-header {
			padding-top: 8px;
		}
		.clause-box {
			max-height: min(65dvh, 560px);
			padding: 0;
			overflow-y: auto;
			overscroll-behavior: contain;
			border-width: 1px 0 0;
			border-radius: var(--radius-box) var(--radius-box) 0 0;
		}
		.clause-box-header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 24px;
			margin-bottom: 0;
			padding: 12px 14px;
		}
		.clause-box-summary {
			flex: 1;
		}
		.clause-box-close {
			display: block;
			flex: none;
		}
		.clause-box-body {
			padding: 0 14px calc(14px + env(safe-area-inset-bottom));
		}
	}
</style>
