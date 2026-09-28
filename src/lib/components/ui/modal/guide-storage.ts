import type { GuideVariant } from './guide-content';

const HIDE_GUIDE_STORAGE_KEYS: Record<GuideVariant, string> = {
	rep: 'hide-agreed-guide',
	admin: 'hide-agreed-admin-guide'
};

export function isGuideHidden(variant: GuideVariant): boolean {
	return localStorage.getItem(HIDE_GUIDE_STORAGE_KEYS[variant]) === 'true';
}

export function setGuideHidden(variant: GuideVariant, hidden: boolean): void {
	localStorage.setItem(HIDE_GUIDE_STORAGE_KEYS[variant], String(hidden));
}
