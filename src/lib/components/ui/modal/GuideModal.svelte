<script lang="ts">
	import { onMount } from 'svelte';
	import Checkbox from '$lib/components/ui/Checkbox.svelte';
	import FullHeightModalShell from './FullHeightModalShell.svelte';
	import { guideContent, type GuideVariant } from './guide-content';
	import { isGuideHidden, setGuideHidden } from './guide-storage';

	let { variant, onClose }: { variant: GuideVariant; onClose: () => void } = $props();
	const content = $derived(guideContent[variant]);

	let hideGuide = $state(false);

	onMount(() => {
		hideGuide = isGuideHidden(variant);
	});

	function handleHideGuideChange(checked: boolean) {
		hideGuide = checked;
		setGuideHidden(variant, checked);
	}
</script>

<FullHeightModalShell title={content.title} {onClose}>
	<div class="flex min-h-full flex-col justify-between gap-6 pt-1">
		<div class="space-y-6">
			<p class="text-[15px] leading-[1.45] text-ink-muted">
				{content.intro}
			</p>

			<div>
				<ol class="guide-steps" role="list">
					{#each content.steps as step, index}
						<li class="guide-step">
							<span class="guide-step-number" aria-hidden="true">{index + 1}</span>

							<div class:pb-7={index < content.steps.length - 1}>
								<h3 class="text-[15px] leading-tight font-medium text-ink">{step.title}</h3>

								<p class="mt-1.5 text-[15px] leading-[1.45] text-ink-muted">
									{#if 'highlight' in step && step.highlight}
										<span class="clause-highlight bg-clause-editable-highlight">
											{step.highlight}
										</span>
										{' '}
									{/if}
									{step.description}
								</p>
							</div>
						</li>
					{/each}
				</ol>

				<Checkbox
					label="Don't show this guide again"
					checked={hideGuide}
					onCheckedChange={handleHideGuideChange}
					className="mt-6"
				/>
			</div>
		</div>
	</div>
</FullHeightModalShell>

<style>
	.guide-steps {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.guide-step {
		position: relative;
		display: grid;
		grid-template-columns: 2rem 1fr;
		column-gap: 0.75rem;
	}

	.guide-step-number {
		z-index: 1;
		display: flex;
		width: 2rem;
		height: 2rem;
		align-items: center;
		justify-content: center;
		border: 1px solid var(--color-line);
		border-radius: 9999px;
		background: var(--color-canvas);
		color: var(--color-ink-muted);
		font-size: 0.875rem;
		line-height: 1;
	}

	.guide-step:not(:last-child)::after {
		position: absolute;
		top: 2rem;
		bottom: 0;
		left: calc(1rem - 0.5px);
		width: 1px;
		background: var(--color-line);
		content: '';
	}

	.clause-highlight {
		border-radius: 3px;
		box-decoration-break: clone;
		-webkit-box-decoration-break: clone;
	}
</style>
