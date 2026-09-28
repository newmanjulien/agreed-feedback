<script lang="ts">
	let {
		label,
		checked,
		disabled = false,
		onCheckedChange,
		className = ''
	}: {
		label: string;
		checked: boolean;
		disabled?: boolean;
		onCheckedChange: (checked: boolean) => void;
		className?: string;
	} = $props();
</script>

<label
	class={`flex items-center gap-2.5 text-[15px] text-ink-muted ${disabled ? 'cursor-default opacity-50' : 'cursor-pointer'} ${className}`}
>
	<input
		type="checkbox"
		{checked}
		{disabled}
		onchange={(event) => onCheckedChange(event.currentTarget.checked)}
		class="peer sr-only"
	/>
	<span
		class="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border border-line bg-surface transition-colors
			peer-checked:border-black peer-checked:bg-black
			peer-checked:[&>svg]:opacity-100
			peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent"
		aria-hidden="true"
	>
		<svg class="h-3 w-3 opacity-0 transition-opacity" viewBox="0 0 12 12" fill="none">
			<path
				d="M2.5 6.25L4.8 8.4L9.5 3.6"
				stroke="white"
				stroke-width="1.8"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
	</span>
	<span>{label}</span>
</label>
