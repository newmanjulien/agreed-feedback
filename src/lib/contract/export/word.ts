import { contractName, type ExportBlock, type ExportRun } from './content';

/** Bound library loading and generation; obsolete work can finish but cannot be accepted. */
export async function prepareWord(
	blocks: ExportBlock[],
	companyName: string,
	signal: AbortSignal
): Promise<Blob> {
	signal.throwIfAborted();
	const controller = new AbortController();
	const cancel = () => controller.abort(signal.reason);
	const timeoutError = () => new DOMException('Word preparation timed out', 'TimeoutError');
	const deadline = performance.now() + 30000;
	let rejectCancellation!: () => void;
	const cancelled = new Promise<never>((_, reject) => {
		rejectCancellation = () => reject(controller.signal.reason);
		controller.signal.addEventListener('abort', rejectCancellation, { once: true });
	});
	signal.addEventListener('abort', cancel, { once: true });
	const timeout = setTimeout(() => controller.abort(timeoutError()), 30000);
	try {
		const blob = await Promise.race([
			generateWord(blocks, companyName, controller.signal),
			cancelled
		]);
		// A long synchronous library operation can delay the timeout callback itself.
		if (performance.now() >= deadline) throw timeoutError();
		controller.signal.throwIfAborted();
		return blob;
	} finally {
		clearTimeout(timeout);
		signal.removeEventListener('abort', cancel);
		controller.signal.removeEventListener('abort', rejectCancellation);
	}
}

async function generateWord(
	blocks: ExportBlock[],
	companyName: string,
	signal: AbortSignal
): Promise<Blob> {
	const {
		Document,
		Packer,
		Paragraph,
		TextRun,
		Table,
		TableRow,
		TableCell,
		AlignmentType,
		HeadingLevel,
		TableBorders,
		BorderStyle,
		TableLayoutType,
		WidthType
	} = await import('docx');
	signal.throwIfAborted();
	const runs = (content: ExportRun[], header = false) =>
		content.flatMap((run) =>
			run.text.split(/\r\n|\r|\n/).map(
				(text, index) =>
					new TextRun({
						text,
						break: index ? 1 : undefined,
						bold: run.bold ?? (header ? true : undefined),
						italics: run.italic
					})
			)
		);
	const border = { style: BorderStyle.SINGLE, size: 6, color: '171717' };
	const children = blocks.map((block) => {
		if (block.kind !== 'table')
			return new Paragraph({
				children: runs(block.content),
				widowControl: true,
				heading:
					block.kind === 'heading'
						? [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][
								block.level - 1
							]
						: undefined
			});
		const signature = block.variant === 'signature';
		const columnCount = block.rows[0].length;
		const columnWidth = Math.floor(9360 / columnCount);
		return new Table({
			width: { size: 9360, type: WidthType.DXA },
			columnWidths: Array(columnCount).fill(columnWidth),
			layout: signature ? TableLayoutType.AUTOFIT : TableLayoutType.FIXED,
			borders: signature
				? TableBorders.NONE
				: {
						top: border,
						bottom: border,
						left: border,
						right: border,
						insideHorizontal: border,
						insideVertical: border
					},
			margins: signature
				? { top: 135, bottom: 135, left: 0, right: 180 }
				: { top: 120, bottom: 120, left: 120, right: 120 },
			rows: block.rows.map(
				(row, index) =>
					new TableRow({
						tableHeader: index < block.headerRowCount,
						cantSplit: true,
						children: row.map(
							(cell) =>
								new TableCell({
									width: { size: columnWidth, type: WidthType.DXA },
									shading:
										!signature && index < block.headerRowCount ? { fill: 'E8EAED' } : undefined,
									children: [
										new Paragraph({
											children: runs(cell, index < block.headerRowCount),
											style: 'ContractTable',
											keepNext: signature && index < block.rows.length - 1,
											keepLines: signature
										})
									]
								})
						)
					})
			)
		});
	});
	const document = new Document({
		title: contractName(companyName),
		styles: {
			default: {
				document: {
					run: { font: 'Arial', size: 23, color: '171717' },
					paragraph: {
						alignment: AlignmentType.JUSTIFIED,
						spacing: { after: 300, line: 350 }
					}
				},
				heading1: {
					run: { size: 30, bold: true },
					paragraph: {
						alignment: AlignmentType.CENTER,
						spacing: { before: 0, after: 495, line: 300 },
						keepNext: true,
						keepLines: true
					}
				},
				heading2: {
					run: { size: 26, bold: true },
					paragraph: {
						alignment: AlignmentType.LEFT,
						spacing: { before: 510, after: 150, line: 300 },
						keepNext: true,
						keepLines: true
					}
				},
				heading3: {
					run: { size: 24, bold: true },
					paragraph: {
						alignment: AlignmentType.LEFT,
						spacing: { before: 360, after: 150, line: 300 },
						keepNext: true,
						keepLines: true
					}
				}
			},
			paragraphStyles: [
				{
					id: 'ContractTable',
					name: 'Contract Table',
					basedOn: 'Normal',
					run: { size: 21 },
					paragraph: { alignment: AlignmentType.LEFT, spacing: { after: 0, line: 336 } }
				}
			]
		},
		sections: [
			{
				properties: {
					page: {
						size: { width: 12240, height: 15840 },
						margin: { top: 1440, right: 1440, bottom: 1320, left: 1440 }
					}
				},
				children
			}
		]
	});
	const blob = await Packer.toBlob(document);
	signal.throwIfAborted();
	return blob;
}

/** Called in the click's original stack, using an already accepted object URL. */
export function downloadWord(url: string, companyName: string): void {
	const now = new Date();
	const pad = (value: number) => String(value).padStart(2, '0');
	const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
	const time = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
	const anchor = window.document.createElement('a');
	try {
		anchor.href = url;
		anchor.download = `${contractName(companyName)} - ${date} ${time}.docx`;
		window.document.body.append(anchor);
		anchor.click();
	} finally {
		anchor.remove();
	}
}

export function retireWordUrl(url: string): void {
	// Give any download already triggered with this URL time to consume it.
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
