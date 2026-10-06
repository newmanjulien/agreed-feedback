import { browser } from '$app/environment';
import { env } from '$env/dynamic/public';
import type { FunctionReturnType } from 'convex/server';
import type { api } from '../../convex/_generated/api';

export type CachedCard = FunctionReturnType<typeof api.savedContracts.browse>['page'][number];
export const CACHE_NAMESPACE = `agreed:v1:${env.PUBLIC_CONVEX_URL ?? ''}`;
const CARDS_KEY = `${CACHE_NAMESPACE}:cards`;
const OPENINGS_KEY = `${CACHE_NAMESPACE}:openings`;
const DAY = 24 * 60 * 60 * 1000;
type Opening = { id: string; openedAt: number };
let openings: Opening[] | undefined;

function read(key: string): unknown {
	try {
		return browser ? JSON.parse(localStorage.getItem(key) ?? 'null') : null;
	} catch {
		return null;
	}
}
function write(key: string, value: unknown) {
	try {
		if (browser) localStorage.setItem(key, JSON.stringify(value));
	} catch {
		/* Optional cache. */
	}
}
function isCard(value: unknown): value is CachedCard {
	if (!value || typeof value !== 'object') return false;
	const card = value as CachedCard;
	return (
		typeof card._id === 'string' &&
		typeof card.companyName === 'string' &&
		Number.isFinite(card.savedAt) &&
		!Number.isNaN(new Date(card.savedAt).getTime()) &&
		!!card.creator &&
		typeof card.creator.name === 'string' &&
		(card.creator.avatarUrl === null || typeof card.creator.avatarUrl === 'string')
	);
}
export function readCachedCards(): CachedCard[] {
	const entry = read(CARDS_KEY) as { savedAt?: number; cards?: unknown[] } | null;
	if (
		!entry ||
		!Number.isFinite(entry.savedAt) ||
		Date.now() - entry.savedAt! > DAY ||
		entry.savedAt! > Date.now() ||
		!Array.isArray(entry.cards) ||
		entry.cards.length > 24 ||
		!entry.cards.every(isCard)
	)
		return [];
	return entry.cards;
}
export function storeCards(cards: readonly CachedCard[]) {
	write(CARDS_KEY, { savedAt: Date.now(), cards: cards.slice(0, 24) });
}
export function reconcileCards(id: string, companyName?: string) {
	const cards = readCachedCards();
	const previous = read(CARDS_KEY) as { savedAt?: number } | null;
	write(CARDS_KEY, {
		savedAt: previous?.savedAt ?? Date.now(),
		cards:
			companyName === undefined
				? cards.filter((card) => card._id !== id)
				: cards.map((card) =>
						card._id === id ? { ...card, companyName, savedAt: Date.now() } : card
					)
	});
}
export function recentOpenings(): readonly Opening[] {
	if (!browser) return [];
	if (!openings) {
		const value = read(OPENINGS_KEY);
		openings = Array.isArray(value)
			? value
					.filter(
						(entry): entry is Opening =>
							!!entry && typeof entry.id === 'string' && Number.isFinite(entry.openedAt)
					)
					.sort((a, b) => b.openedAt - a.openedAt)
					.slice(0, 50)
			: [];
	}
	return openings;
}
export function recordOpening(id: string) {
	openings = [
		{ id, openedAt: Date.now() },
		...recentOpenings().filter((entry) => entry.id !== id)
	].slice(0, 50);
	write(OPENINGS_KEY, openings);
}
export function forgetOpening(id: string) {
	openings = recentOpenings().filter((entry) => entry.id !== id);
	write(OPENINGS_KEY, openings);
}
/** Preparation order only; Home keeps the server's display order. */
export function rankCards(
	cards: readonly CachedCard[],
	promoted: readonly string[] = []
): string[] {
	const history = new Map(recentOpenings().map((entry) => [entry.id, entry.openedAt]));
	return cards
		.map((card, order) => ({ card, order }))
		.sort(
			(a, b) =>
				Number(promoted.includes(b.card._id)) - Number(promoted.includes(a.card._id)) ||
				(history.get(b.card._id) ?? 0) - (history.get(a.card._id) ?? 0) ||
				b.card.savedAt - a.card.savedAt ||
				a.order - b.order
		)
		.map(({ card }) => card._id);
}
