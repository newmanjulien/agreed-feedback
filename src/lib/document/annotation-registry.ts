import { getContext, setContext } from 'svelte';

const ANNOTATIONS = Symbol('mounted-annotation-targets');

/** Only mounted owners are retained; component destruction removes every registration. */
export class AnnotationRegistry {
	private owners = new Map<string, Set<HTMLElement>>();

	register(owner: HTMLElement, memberships: readonly string[]) {
		for (const id of memberships) {
			let group = this.owners.get(id);
			if (!group) this.owners.set(id, (group = new Set()));
			group.add(owner);
		}
		return () => {
			for (const id of memberships) {
				const group = this.owners.get(id);
				group?.delete(owner);
				if (!group?.size) this.owners.delete(id);
			}
		};
	}

	forAnnotation(id: string): HTMLElement[] {
		return [...(this.owners.get(id) ?? [])]
			.filter((owner) => owner.isConnected)
			.sort((a, b) =>
				a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
			);
	}

	clear() {
		this.owners.clear();
	}
}

export const setAnnotationRegistry = () => setContext(ANNOTATIONS, new AnnotationRegistry());
export const getAnnotationRegistry = () => getContext<AnnotationRegistry | undefined>(ANNOTATIONS);
