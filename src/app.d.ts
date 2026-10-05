import type { ContractRouteData } from '$lib/contract/saved';

declare global {
	namespace App {
		interface PageData {
			contractRoute?: ContractRouteData;
		}
	}
}

export {};
