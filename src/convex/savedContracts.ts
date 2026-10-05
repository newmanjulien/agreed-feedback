import { paginationOptsValidator, paginationResultValidator } from 'convex/server';
import { ConvexError, v, type Infer } from 'convex/values';
import { mutation, query, type QueryCtx } from './_generated/server';
import type { Doc } from './_generated/dataModel';
import schema from './schema';
import { contractCard, selections, snapshot } from './savedContractValidators';
import { MAX_CONTRACT_BLOCKS, MAX_PLAYBOOK_ITEMS } from '../lib/playbook/validation';
import { validatePlaybook } from '../lib/playbook/audit';
import { CompiledContract } from '../lib/contract/compiled-contract';
import { toDocumentOverlay } from '../lib/playbook/document-overlay';
import { activeConflicts } from '../lib/playbook/selection-conflicts';
import { sameSelection } from '../lib/playbook/model';

function companyName(value: string) {
	const name = value.trim();
	if (!name) throw new ConvexError('Enter a buyer company name.');
	if (name.length > 200) throw new ConvexError('Company names must be 200 characters or fewer.');
	return name;
}

// Content versions describe the exact captured source, independent of later Admin edits.
function contentVersion(value: unknown) {
	const text = JSON.stringify(value);
	let hash = 2166136261;
	for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
	return `${text.length}:${(hash >>> 0).toString(16)}`;
}

function validateSelections(
	items: Doc<'playbookItems'>[],
	selected: Infer<typeof selections>,
	compiled: CompiledContract
) {
	const byId = new Map<string, Doc<'playbookItems'>>(items.map((item) => [item._id, item]));
	const selectedItems = Object.entries(selected).map(([itemId, concessionId]) => {
		const item = byId.get(itemId);
		if (!item?.concessions.some((c) => c.id === concessionId))
			throw new ConvexError('A selected concession does not belong to this contract.');
		return toDocumentOverlay(item);
	});
	if (activeConflicts(compiled.index, selectedItems, selected).length)
		throw new ConvexError('Remove conflicting concessions before saving.');
}

async function readSnapshot(ctx: QueryCtx, contract: Doc<'savedContracts'>) {
	const [blocks, items] = await Promise.all([
		ctx.db
			.query('contractSnapshotBlocks')
			.withIndex('by_contractId', (q) => q.eq('contractId', contract._id))
			.take(MAX_CONTRACT_BLOCKS + 1),
		ctx.db
			.query('contractSnapshotItems')
			.withIndex('by_contractId', (q) => q.eq('contractId', contract._id))
			.take(MAX_PLAYBOOK_ITEMS + 1)
	]);
	if (blocks.length !== contract.blockCount || items.length !== contract.itemCount)
		throw new ConvexError('This contract snapshot is incomplete.');
	return {
		blocks: blocks.map((row) => row.block).sort((a, b) => a.order - b.order),
		items: items.map((row) => row.item),
		baselineVersion: contract.baselineVersion,
		playbookVersion: contract.playbookVersion
	};
}

export const browse = query({
	args: { search: v.string(), paginationOpts: paginationOptsValidator },
	returns: paginationResultValidator(contractCard),
	handler: async (ctx, args) => {
		const search = args.search.trim().slice(0, 200);
		const contracts = ctx.db.query('savedContracts');
		const query = search
			? contracts.withSearchIndex('search_companyName', (q) => q.search('companyName', search))
			: contracts.withIndex('by_savedAt').order('desc');
		const result = await query.paginate({
			...args.paginationOpts,
			numItems: Math.min(args.paginationOpts.numItems, 48)
		});
		return {
			...result,
			page: result.page.map(({ _id, companyName, savedAt }) => ({ _id, companyName, savedAt }))
		};
	}
});

export const currentSnapshot = query({
	args: {},
	returns: snapshot,
	handler: async (ctx) => {
		const [records, items] = await Promise.all([
			ctx.db
				.query('contractBlocks')
				.withIndex('by_order')
				.take(MAX_CONTRACT_BLOCKS + 1),
			ctx.db.query('playbookItems').take(MAX_PLAYBOOK_ITEMS + 1)
		]);
		if (!records.length) throw new ConvexError('The baseline contract is not available.');
		if (records.length > MAX_CONTRACT_BLOCKS || items.length > MAX_PLAYBOOK_ITEMS)
			throw new ConvexError('Contract exceeds supported size.');
		const blocks = records.map(({ _id, _creationTime, ...block }) => block);
		return {
			blocks,
			items,
			baselineVersion: contentVersion(blocks),
			playbookVersion: contentVersion(items)
		};
	}
});

export const load = query({
	// Invalid URLs return the same missing state as deleted contracts.
	args: { id: v.string() },
	returns: v.union(v.null(), v.object({ contract: schema.doc('savedContracts'), snapshot })),
	handler: async (ctx, { id }) => {
		const contractId = ctx.db.normalizeId('savedContracts', id);
		const contract = contractId ? await ctx.db.get('savedContracts', contractId) : null;
		return contract ? { contract, snapshot: await readSnapshot(ctx, contract) } : null;
	}
});

export const metadata = query({
	args: { id: v.id('savedContracts') },
	returns: v.union(schema.doc('savedContracts').pick('companyName'), v.null()),
	handler: async (ctx, { id }) => {
		const contract = await ctx.db.get('savedContracts', id);
		return contract ? { companyName: contract.companyName } : null;
	}
});

export const create = mutation({
	args: { companyName: v.string(), snapshot, selectedConcessions: selections },
	returns: schema.doc('savedContracts'),
	handler: async (ctx, args) => {
		const name = companyName(args.companyName);
		const { blocks, items, baselineVersion, playbookVersion } = args.snapshot;
		if (!blocks.length || blocks.length > MAX_CONTRACT_BLOCKS || items.length > MAX_PLAYBOOK_ITEMS)
			throw new ConvexError('Contract exceeds supported size or has no baseline.');
		if (new TextEncoder().encode(JSON.stringify(args.snapshot)).byteLength > 8_000_000)
			throw new ConvexError('Contract snapshot exceeds supported size.');
		if (baselineVersion !== contentVersion(blocks) || playbookVersion !== contentVersion(items))
			throw new ConvexError('The captured contract version is invalid.');
		if (new Set(items.map((item) => item._id)).size !== items.length)
			throw new ConvexError('Duplicate playbook item identifiers.');
		validateSelections(items, args.selectedConcessions, validatePlaybook(blocks, items));
		const id = await ctx.db.insert('savedContracts', {
			companyName: name,
			savedAt: Date.now(),
			selectedConcessions: args.selectedConcessions,
			baselineVersion,
			playbookVersion,
			blockCount: blocks.length,
			itemCount: items.length
		});
		for (const block of blocks)
			await ctx.db.insert('contractSnapshotBlocks', { contractId: id, block });
		for (const item of items)
			await ctx.db.insert('contractSnapshotItems', { contractId: id, itemId: item._id, item });
		return (await ctx.db.get('savedContracts', id))!;
	}
});

export const save = mutation({
	args: { id: v.id('savedContracts'), selectedConcessions: selections },
	returns: schema.doc('savedContracts'),
	handler: async (ctx, { id, selectedConcessions }) => {
		const contract = await ctx.db.get('savedContracts', id);
		if (!contract)
			throw new ConvexError('This contract was deleted. Your changes have not been saved.');
		if (sameSelection(contract.selectedConcessions, selectedConcessions)) return contract;
		// Snapshots are validated once at creation and never edited. Only selected items
		// can conflict; an empty selection needs no document reads or baseline compilation.
		const selectedIds = Object.keys(selectedConcessions) as Doc<'playbookItems'>['_id'][];
		if (selectedIds.length > MAX_PLAYBOOK_ITEMS)
			throw new ConvexError('Too many selected concessions.');
		if (selectedIds.length) {
			const blocks = await ctx.db
				.query('contractSnapshotBlocks')
				.withIndex('by_contractId', (q) => q.eq('contractId', id))
				.take(MAX_CONTRACT_BLOCKS + 1);
			if (blocks.length !== contract.blockCount)
				throw new ConvexError('This contract snapshot is incomplete.');
			const items: Doc<'playbookItems'>[] = [];
			// Bound concurrent I/O while reading only the selected snapshot items.
			const batchSize = 64;
			for (let offset = 0; offset < selectedIds.length; offset += batchSize) {
				const rows = await Promise.all(
					selectedIds.slice(offset, offset + batchSize).map((itemId) =>
						ctx.db
							.query('contractSnapshotItems')
							.withIndex('by_contractId_and_itemId', (q) =>
								q.eq('contractId', id).eq('itemId', itemId)
							)
							.unique()
					)
				);
				for (const row of rows) if (row) items.push(row.item);
			}
			validateSelections(
				items,
				selectedConcessions,
				new CompiledContract(blocks.map((row) => row.block).sort((a, b) => a.order - b.order))
			);
		}
		// Latest committed save wins. Company name and snapshot are never changed here.
		const savedAt = Date.now();
		await ctx.db.patch('savedContracts', id, { selectedConcessions, savedAt });
		return (await ctx.db.get('savedContracts', id))!;
	}
});

export const rename = mutation({
	args: { id: v.id('savedContracts'), companyName: v.string() },
	returns: v.null(),
	handler: async (ctx, { id, companyName: value }) => {
		const contract = await ctx.db.get('savedContracts', id);
		if (!contract) throw new ConvexError('This contract was deleted.');
		const name = companyName(value);
		if (name === contract.companyName) return null;
		await ctx.db.patch('savedContracts', id, { companyName: name });
		return null;
	}
});

export const remove = mutation({
	args: { id: v.id('savedContracts') },
	returns: v.null(),
	handler: async (ctx, { id }) => {
		if (!(await ctx.db.get('savedContracts', id))) return null;
		for (const table of ['contractSnapshotBlocks', 'contractSnapshotItems'] as const) {
			const rows = await ctx.db
				.query(table)
				.withIndex('by_contractId', (q) => q.eq('contractId', id))
				.take(4097);
			if (rows.length > 4096) throw new ConvexError('Contract exceeds supported size.');
			for (const row of rows) await ctx.db.delete(table, row._id);
		}
		await ctx.db.delete('savedContracts', id);
		return null;
	}
});
