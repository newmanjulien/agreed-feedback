export type RenderPriority = 'foreground' | 'background' | 'alternative';
export type Priority = () => RenderPriority;
const rank = { foreground: 0, background: 1, alternative: 2 };
interface Slice {
	priority: Priority;
	work: () => unknown;
	resolve: (value: unknown) => void;
	reject: (cause: unknown) => void;
	release?: () => void;
}

/** Shared CPU/DOM slices. Priority is read at dispatch, so navigation promotes queued work. */
export class DocumentScheduler {
	#queue: Slice[] = [];
	#cancel?: () => void;
	#destroyed = false;
	#busy = false;
	#listening = false;
	#visibility = () => {
		this.#cancel?.();
		this.#cancel = undefined;
		this.#schedule();
	};
	run<T>(priority: Priority, work: () => T, signal?: AbortSignal): Promise<T> {
		if (signal?.aborted) return Promise.reject(signal.reason);
		if (this.#destroyed) return Promise.reject(new Error('Document scheduler released.'));
		if (!this.#listening) {
			document.addEventListener('visibilitychange', this.#visibility);
			this.#listening = true;
		}
		return new Promise<T>((resolve, reject) => {
			const slice: Slice = { priority, work, resolve: resolve as Slice['resolve'], reject };
			if (signal) {
				const cancel = () => {
					this.#queue = this.#queue.filter((queued) => queued !== slice);
					slice.release?.();
					reject(signal.reason);
					this.wake();
				};
				signal.addEventListener('abort', cancel, { once: true });
				slice.release = () => signal.removeEventListener('abort', cancel);
			}
			this.#queue.push(slice);
			if (priority() === 'foreground') this.wake();
			else this.#schedule();
		});
	}
	wake() {
		this.#visibility();
	}
	#schedule() {
		if (this.#busy || this.#cancel || this.#destroyed || !this.#queue.length) return;
		this.#queue.sort((a, b) => rank[a.priority()] - rank[b.priority()]);
		const foreground = this.#queue[0].priority() === 'foreground';
		if (!foreground && document.hidden) return;
		const dispatch = () => {
			this.#cancel = undefined;
			this.#queue.sort((a, b) => rank[a.priority()] - rank[b.priority()]);
			if (document.hidden && this.#queue[0]?.priority() !== 'foreground') return;
			const slice = this.#queue.shift();
			if (!slice) return;
			slice.release?.();
			this.#busy = true;
			try {
				const result = slice.work();
				Promise.resolve(result)
					.then(slice.resolve, slice.reject)
					.finally(() => {
						this.#busy = false;
						this.#schedule();
					});
			} catch (cause) {
				slice.reject(cause);
				this.#busy = false;
				this.#schedule();
			}
		};
		if (!foreground && typeof window.requestIdleCallback === 'function') {
			const id = window.requestIdleCallback((deadline) => {
				if (deadline.timeRemaining() > 0) dispatch();
				else {
					this.#cancel = undefined;
					this.#schedule();
				}
			});
			this.#cancel = () => window.cancelIdleCallback(id);
		} else {
			const id = setTimeout(dispatch, foreground ? 0 : 50);
			this.#cancel = () => clearTimeout(id);
		}
	}
	destroy() {
		this.#destroyed = true;
		this.#cancel?.();
		if (this.#listening) document.removeEventListener('visibilitychange', this.#visibility);
		for (const slice of this.#queue) {
			slice.release?.();
			slice.reject(new Error('Document scheduler released.'));
		}
		this.#queue = [];
	}
}
