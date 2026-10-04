export type RedlineDiffPart =
	| { kind: 'equal'; text: string }
	| { kind: 'delete'; text: string }
	| { kind: 'insert'; text: string };

const MAX_LCS_CELLS = 65_536;
const MAX_DIFF_PARTS = 128;

const MIN_ANCHOR_WORDS = 2;
const MIN_ANCHOR_CHARACTERS = 8;
const MIN_LONG_ANCHOR_CHARACTERS = 10;
const MIN_READABLE_RETENTION = 0.4;
const MAX_NON_SUBSTANTIVE_LENGTH = 128;

function appendPart(parts: RedlineDiffPart[], kind: RedlineDiffPart['kind'], text: string) {
	if (!text) return;
	const previous = parts.at(-1);
	if (previous?.kind === kind) previous.text += text;
	else parts.push({ kind, text });
}

function isStrongAnchor(text: string): boolean {
	const words = text.match(/[\p{L}\p{N}][\p{L}\p{N}\p{M}]*/gu) ?? [];
	let characters = 0;
	for (const word of words) {
		const length = word.match(/[\p{L}\p{N}]/gu)!.length;
		if (length >= MIN_LONG_ANCHOR_CHARACTERS) return true;
		characters += length;
	}
	return words.length >= MIN_ANCHOR_WORDS && characters >= MIN_ANCHOR_CHARACTERS;
}

/** Fold every weak internal equality into both sides of the surrounding edit. */
function collapseWeakEqualities(parts: readonly RedlineDiffPart[]): RedlineDiffPart[] {
	const result: RedlineDiffPart[] = [];
	let deleted = '',
		inserted = '';
	function flush() {
		appendPart(result, 'delete', deleted);
		appendPart(result, 'insert', inserted);
		deleted = inserted = '';
	}
	for (const [i, part] of parts.entries()) {
		if (part.kind === 'delete') deleted += part.text;
		else if (part.kind === 'insert') inserted += part.text;
		else if (i > 0 && i < parts.length - 1 && !isStrongAnchor(part.text)) {
			deleted += part.text;
			inserted += part.text;
		} else {
			flush();
			appendPart(result, 'equal', part.text);
		}
	}
	// Buffering across weak islands reaches a stable, coalesced result in one pass.
	flush();
	return result;
}

/** Preserve word boundaries: changing "now here" to "nowhere" is a wording edit. */
function hasOnlySpacingOrPunctuationChanges(before: string, after: string): boolean {
	const words = before.match(/[\p{L}\p{N}\p{M}\p{S}]+/gu) ?? [];
	const replacementWords = after.match(/[\p{L}\p{N}\p{M}\p{S}]+/gu) ?? [];
	return (
		words.length > 0 &&
		words.length === replacementWords.length &&
		words.every((word, i) => word === replacementWords[i])
	);
}

function substantiveCharacters(text: string): number {
	let count = 0;
	for (const character of text) if (/[\p{L}\p{N}\p{M}\p{S}]/u.test(character)) count++;
	return count;
}

function hasReadableRetention(
	parts: readonly RedlineDiffPart[],
	before: string,
	after: string
): boolean {
	const weight = substantiveCharacters(before) + substantiveCharacters(after);
	if (!weight) return before.length + after.length <= MAX_NON_SUBSTANTIVE_LENGTH;
	let retained = 0;
	for (const part of parts) if (part.kind === 'equal') retained += substantiveCharacters(part.text);
	return (2 * retained) / weight >= MIN_READABLE_RETENTION;
}

/** A bounded presentation diff. null asks the caller to use whole-range redlining. */
export function diffRedlineText(before: string, after: string): readonly RedlineDiffPart[] | null {
	if (before === after) return before ? [{ kind: 'equal', text: before }] : [];
	// Keep visible chunks atomic, but let whitespace change independently of words.
	const a = before.match(/\s+|[^\s]+/gu) ?? [];
	const b = after.match(/\s+|[^\s]+/gu) ?? [];
	let prefix = 0;
	while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
	let aEnd = a.length,
		bEnd = b.length;
	while (aEnd > prefix && bEnd > prefix && a[aEnd - 1] === b[bEnd - 1]) {
		aEnd--;
		bEnd--;
	}
	const n = aEnd - prefix,
		m = bEnd - prefix;
	if (n && m && (n + 1) * (m + 1) > MAX_LCS_CELLS) return null;

	const candidate: RedlineDiffPart[] = [];
	appendPart(candidate, 'equal', a.slice(0, prefix).join(''));
	let sourceGap = prefix,
		replacementGap = prefix;
	function gap(sourceEnd: number, replacementEnd: number) {
		// Emit the whole unmatched gap in conventional deletion-before-insertion order.
		appendPart(candidate, 'delete', a.slice(sourceGap, sourceEnd).join(''));
		appendPart(candidate, 'insert', b.slice(replacementGap, replacementEnd).join(''));
	}
	if (n && m) {
		const width = m + 1;
		const lcs = new Uint16Array((n + 1) * width);
		for (let i = n - 1; i >= 0; i--)
			for (let j = m - 1; j >= 0; j--)
				lcs[i * width + j] =
					a[prefix + i] === b[prefix + j]
						? 1 + lcs[(i + 1) * width + j + 1]
						: Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
		let i = 0,
			j = 0;
		while (i < n && j < m) {
			if (a[prefix + i] === b[prefix + j]) {
				gap(prefix + i, prefix + j);
				appendPart(candidate, 'equal', a[prefix + i]);
				sourceGap = prefix + ++i;
				replacementGap = prefix + ++j;
			} else if (lcs[(i + 1) * width + j] >= lcs[i * width + j + 1]) {
				// Stable tie-break: skip the source token first.
				i++;
			} else j++;
		}
	}
	gap(aEnd, bEnd);
	appendPart(candidate, 'equal', a.slice(aEnd).join(''));
	// Nonlexical edits already have useful exact anchors, even short words between spaces.
	const nonlexical = hasOnlySpacingOrPunctuationChanges(before, after);
	const parts = nonlexical ? candidate : collapseWeakEqualities(candidate);
	if (parts.length > MAX_DIFF_PARTS) return null;
	if (!nonlexical && !hasReadableRetention(parts, before, after)) return null;
	let reconstructedBefore = '',
		reconstructedAfter = '';
	for (const part of parts) {
		if (part.kind !== 'insert') reconstructedBefore += part.text;
		if (part.kind !== 'delete') reconstructedAfter += part.text;
	}
	if (reconstructedBefore !== before || reconstructedAfter !== after) return null;
	return parts;
}
