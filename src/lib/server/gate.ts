import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';

export const COOKIE_NAME = 'agreed_gate';
export const COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

function password(): string | undefined {
	return env.APP_PASSWORD || undefined;
}

export function gateConfigured(): boolean {
	return password() !== undefined;
}

function equal(left: string, right: string): boolean {
	const leftDigest = createHash('sha256').update(left).digest();
	const rightDigest = createHash('sha256').update(right).digest();
	return timingSafeEqual(leftDigest, rightDigest);
}

export function correctPassword(candidate: string): boolean {
	const configured = password();
	return configured !== undefined && equal(candidate, configured);
}

function signature(issuedAt: string, secret: string): string {
	return createHmac('sha256', secret).update(`agreed-gate-v1:${issuedAt}`).digest('base64url');
}

export function issueUnlock(): string {
	const configured = password();
	if (!configured) throw new Error('APP_PASSWORD is required');
	const issuedAt = Math.floor(Date.now() / 1000).toString();
	return `${issuedAt}.${signature(issuedAt, configured)}`;
}

export function validUnlock(value: string | undefined): boolean {
	const configured = password();
	if (!configured || !value) return false;
	const match = /^(\d{10})\.([A-Za-z0-9_-]{43})$/.exec(value);
	if (!match) return false;
	const issuedAt = Number(match[1]);
	const now = Math.floor(Date.now() / 1000);
	if (issuedAt > now || now - issuedAt >= COOKIE_MAX_AGE) return false;
	return equal(match[2], signature(match[1], configured));
}

export function localDestination(value: string | null): string {
	if (
		!value ||
		!value.startsWith('/') ||
		value.startsWith('//') ||
		/[\\\u0000-\u001f\u007f]/.test(value)
	)
		return '/';
	try {
		const parsed = new URL(value, 'https://gate.invalid');
		if (parsed.origin !== 'https://gate.invalid' || /^\/gate\/?$/.test(parsed.pathname)) return '/';
		return parsed.pathname + parsed.search + parsed.hash;
	} catch {
		return '/';
	}
}
