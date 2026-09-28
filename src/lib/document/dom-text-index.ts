export interface TextPoint {
	node: Node;
	offset: number;
}

export interface IndexedTextBlock {
	blockKey: string;
	text: string;
	starts: TextPoint[];
	ends: TextPoint[];
}

const TEXT_BLOCK_SELECTOR = '[data-block-key]';

function isIndexableTextNode(node: Text): boolean {
	const parent = node.parentElement;
	if (!parent || !node.data) return false;
	return !parent.closest('[aria-hidden="true"], script, style');
}

function appendCharacter(
	block: IndexedTextBlock,
	character: string,
	start: TextPoint,
	end: TextPoint,
	lowercase: boolean
) {
	const normalized = lowercase ? character.toLocaleLowerCase() : character;
	for (let index = 0; index < normalized.length; index += 1) {
		block.text += normalized[index];
		block.starts.push(start);
		block.ends.push(end);
	}
}

function appendTextNode(block: IndexedTextBlock, node: Text, lowercase: boolean) {
	let offset = 0;

	for (const character of node.data) {
		const nextOffset = offset + character.length;
		const start = { node, offset };
		const end = { node, offset: nextOffset };

		if (/\s/u.test(character)) {
			if (block.text && !block.text.endsWith(' ')) {
				appendCharacter(block, ' ', start, end, lowercase);
			}
		} else {
			appendCharacter(block, character, start, end, lowercase);
		}

		offset = nextOffset;
	}
}

function collectBlockText(block: IndexedTextBlock, element: HTMLElement, lowercase: boolean) {
	const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
	let node = walker.nextNode();

	while (node) {
		if (node instanceof Text && isIndexableTextNode(node)) appendTextNode(block, node, lowercase);
		node = walker.nextNode();
	}
}

export function indexDocumentText(
	root: HTMLElement,
	options: { lowercase?: boolean } = {}
): IndexedTextBlock[] {
	const blocks: IndexedTextBlock[] = [];
	const flowingBlocks = new Map<string, IndexedTextBlock>();

	for (const element of root.querySelectorAll<HTMLElement>(TEXT_BLOCK_SELECTOR)) {
		const blockKey = element.dataset.blockKey;
		if (!blockKey) continue;
		if (element.matches('table')) {
			for (const cell of element.querySelectorAll<HTMLElement>('th, td')) {
				const block = { blockKey, text: '', starts: [], ends: [] };
				collectBlockText(block, cell, options.lowercase ?? false);
				blocks.push(block);
			}
			continue;
		}

		let block = flowingBlocks.get(blockKey);
		if (!block) {
			block = { blockKey, text: '', starts: [], ends: [] };
			flowingBlocks.set(blockKey, block);
			blocks.push(block);
		}

		collectBlockText(block, element, options.lowercase ?? false);
	}

	return blocks;
}
