<script lang="ts">
	import { env } from '$env/dynamic/public';
	import type { InlineToken } from '$lib/document/pagination/types';
	let { tokens, profileMode = false }: { tokens: readonly InlineToken[]; profileMode?: boolean } =
		$props();
</script>

<!-- Measurement needs the same spans and text, but never reads interaction metadata.
     Visible source/provenance markup is unchanged. Set the diagnostic flag to 1 to profile source metadata. -->
{#if profileMode && env.PUBLIC_CONTRACT_PROFILE_METADATA !== '1'}
	{#each tokens as token}<span
			data-contract-token=""
			style:font-weight={token.marks?.bold === undefined
				? undefined
				: token.marks.bold
					? '700'
					: '400'}
			style:font-style={token.marks?.italic === undefined
				? undefined
				: token.marks.italic
					? 'italic'
					: 'normal'}>{token.value}</span
		>{/each}
{:else}
	{#each tokens as token}<span
			style:font-weight={token.marks?.bold === undefined
				? undefined
				: token.marks.bold
					? '700'
					: '400'}
			style:font-style={token.marks?.italic === undefined
				? undefined
				: token.marks.italic
					? 'italic'
					: 'normal'}
			data-contract-token=""
			data-source-start-key={token.source?.start.sourceKey}
			data-source-start-offset={token.source?.start.offset}
			data-source-end-key={token.source?.end.sourceKey}
			data-source-end-offset={token.source?.end.offset}
			data-visual-source={token.visualSource ? JSON.stringify(token.visualSource) : undefined}
			data-generated-offset={token.generatedOffset}
			data-source-kind={token.sourceKind}
			data-generated={token.generated}
			data-revision={token.revision}>{token.value}</span
		>{/each}
{/if}
