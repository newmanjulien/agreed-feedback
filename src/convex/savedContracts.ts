import { paginationOptsValidator, paginationResultValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import { mutation, query, type QueryCtx } from './_generated/server';
import type { Doc } from './_generated/dataModel';
import schema from './schema';
import {
	contractCard,
	contractState,
	saveResult,
	selections,
	snapshot
} from './savedContractValidators';
import { MAX_CONTRACT_BLOCKS, MAX_PLAYBOOK_ITEMS } from '../lib/playbook/validation';
import { validatePlaybook } from '../lib/playbook/audit';
import { CompiledContract } from '../lib/contract/compiled-contract';
import { toDocumentOverlay } from '../lib/playbook/document-overlay';
import { activeConflicts } from '../lib/playbook/selection-conflicts';
import { sameSelection } from '../lib/playbook/model';
import { OCEANS_PROFILE } from '../lib/profiles';

function companyName(value: string) {
	const name = value.trim();
	if (!name) throw new ConvexError('Enter a buyer company name.');
	if (name.length > 200) throw new ConvexError('Company names must be 200 characters or fewer.');
	return name;
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
		items: items.map((row) => row.item)
	};
}

function stateOf(contract: Doc<'savedContracts'>) {
	return {
		companyName: contract.companyName,
		selectedConcessions: contract.selectedConcessions,
		revision: contract.revision ?? 0,
		lastOperationId: contract.lastOperationId ?? null
	};
}

async function readCurrentSnapshot(ctx: QueryCtx) {
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
	return { blocks, items };
}

function validateOperationId(operationId: string) {
	if (!operationId.trim() || operationId.length > 200)
		throw new ConvexError('Invalid save operation.');
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
			page: result.page.map(({ _id, companyName, savedAt }) => ({
				_id,
				companyName,
				savedAt,
				creator: OCEANS_PROFILE
			}))
		};
	}
});

export const currentSnapshot = query({
	args: {},
	returns: snapshot,
	handler: readCurrentSnapshot
});

export const load = query({
	// Invalid URLs return the same missing state as deleted contracts.
	args: { id: v.string() },
	returns: v.union(
		v.null(),
		v.object({
			contract: schema.doc('savedContracts').omit('baselineVersion', 'playbookVersion'),
			snapshot
		})
	),
	handler: async (ctx, { id }) => {
		const contractId = ctx.db.normalizeId('savedContracts', id);
		const contract = contractId ? await ctx.db.get('savedContracts', contractId) : null;
		if (!contract) return null;
		const { baselineVersion, playbookVersion, ...details } = contract;
		return { contract: details, snapshot: await readSnapshot(ctx, contract) };
	}
});

export const state = query({
	// Like full reads, route IDs may be malformed or refer to deleted contracts.
	args: { id: v.string() },
	returns: v.union(contractState, v.null()),
	handler: async (ctx, { id }) => {
		const contractId = ctx.db.normalizeId('savedContracts', id);
		const contract = contractId ? await ctx.db.get('savedContracts', contractId) : null;
		return contract ? stateOf(contract) : null;
	}
});

export const create = mutation({
	args: { companyName: v.string(), operationId: v.string() },
	returns: v.union(
		v.object({ status: v.literal('created'), id: v.id('savedContracts') }),
		v.object({ status: v.literal('deleted') })
	),
	handler: async (ctx, args) => {
		validateOperationId(args.operationId);
		const receipt = await ctx.db
			.query('contractCreationReceipts')
			.withIndex('by_operationId', (q) => q.eq('operationId', args.operationId))
			.unique();
		if (receipt) {
			return (await ctx.db.get('savedContracts', receipt.contractId))
				? { status: 'created' as const, id: receipt.contractId }
				: { status: 'deleted' as const };
		}
		const name = companyName(args.companyName);
		// Capture the current source in the same transaction that creates the contract.
		const captured = await readCurrentSnapshot(ctx);
		const { blocks, items } = captured;
		if (new TextEncoder().encode(JSON.stringify(captured)).byteLength > 8_000_000)
			throw new ConvexError('Contract snapshot exceeds supported size.');
		validatePlaybook(blocks, items);
		const id = await ctx.db.insert('savedContracts', {
			companyName: name,
			savedAt: Date.now(),
			selectedConcessions: {},
			revision: 0,
			blockCount: blocks.length,
			itemCount: items.length
		});
		for (const block of blocks)
			await ctx.db.insert('contractSnapshotBlocks', { contractId: id, block });
		for (const item of items)
			await ctx.db.insert('contractSnapshotItems', { contractId: id, itemId: item._id, item });
		await ctx.db.insert('contractCreationReceipts', {
			operationId: args.operationId,
			contractId: id
		});
		return { status: 'created' as const, id };
	}
});

export const saveChoices = mutation({
	args: {
		id: v.id('savedContracts'),
		selectedConcessions: selections,
		expectedRevision: v.number(),
		operationId: v.string()
	},
	returns: saveResult,
	handler: async (ctx, { id, selectedConcessions, expectedRevision, operationId }) => {
		validateOperationId(operationId);
		if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
			throw new ConvexError('Invalid contract revision.');
		const contract = await ctx.db.get('savedContracts', id);
		if (!contract) return { status: 'deleted' as const };
		// A replay is acknowledged before checking its now-stale expected revision.
		if (contract.lastOperationId === operationId)
			return { status: 'saved' as const, state: stateOf(contract) };
		if ((contract.revision ?? 0) !== expectedRevision)
			return { status: 'conflict' as const, state: stateOf(contract) };
		// An unchanged save acknowledges current state without consuming a revision or
		// operation ID. A retry after an intervening change still follows conflict rules.
		if (sameSelection(contract.selectedConcessions, selectedConcessions))
			return { status: 'saved' as const, state: stateOf(contract) };
		// Snapshots are validated once at creation and never edited. Validate membership
		// first; baseline compilation is only needed to check conflicts between items.
		const selectedIds = Object.keys(selectedConcessions) as Doc<'playbookItems'>['_id'][];
		if (selectedIds.length > MAX_PLAYBOOK_ITEMS)
			throw new ConvexError('Too many selected concessions.');
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
			for (const row of rows) {
				if (!row?.item.concessions.some((c) => c.id === selectedConcessions[row.itemId]))
					throw new ConvexError('A selected concession does not belong to this contract.');
				items.push(row.item);
			}
		}
		if (items.length > 1) {
			const blocks = await ctx.db
				.query('contractSnapshotBlocks')
				.withIndex('by_contractId', (q) => q.eq('contractId', id))
				.take(MAX_CONTRACT_BLOCKS + 1);
			if (blocks.length !== contract.blockCount)
				throw new ConvexError('This contract snapshot is incomplete.');
			const compiled = new CompiledContract(
				blocks.map((row) => row.block).sort((a, b) => a.order - b.order)
			);
			if (activeConflicts(compiled.index, items.map(toDocumentOverlay), selectedConcessions).length)
				throw new ConvexError('Remove conflicting concessions before saving.');
		}
		const revision = expectedRevision + 1;
		await ctx.db.patch('savedContracts', id, {
			selectedConcessions,
			revision,
			lastOperationId: operationId,
			savedAt: Date.now()
		});
		return {
			status: 'saved' as const,
			state: stateOf({ ...contract, selectedConcessions, revision, lastOperationId: operationId })
		};
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
		await ctx.db.patch('savedContracts', id, { companyName: name, savedAt: Date.now() });
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
