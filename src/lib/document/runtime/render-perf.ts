import { dev } from '$app/environment';
import { env } from '$env/dynamic/public';
import type { DocumentDomain } from '../domain/document-domain';
import type { LayoutProfileMetrics } from '../pagination/profiler';

const enabled = () => dev || env.PUBLIC_CONTRACT_PERF === '1';

/** Local, bounded navigation milestones; timestamps use the browser time origin. */
export function recordColdStart(name: string, startedAt?: number) {
	if (!enabled() || typeof window === 'undefined') return;
	const at = performance.now();
	const target = window as typeof window & {
		__contractColdStart?: { name: string; at: number; durationMs?: number }[];
	};
	const marks = (target.__contractColdStart ??= []);
	marks.push({ name, at, durationMs: startedAt === undefined ? undefined : at - startedAt });
	if (marks.length > 100) marks.shift();
}

/** Fixed work categories: bounded counters, no source text or backend identifiers. */
type StartupWork = 'sourceAccept';
type StartupCount =
	'authoringAccept' | 'workspaceCreated' | 'rendererCreated' | 'profileSurfaceMount';
type StartupCounters = Partial<Record<StartupWork, { count: number; totalMs: number }>> &
	Partial<Record<StartupCount, { count: number }>>;

function startupCounters() {
	if (!enabled() || typeof window === 'undefined') return;
	const target = window as typeof window & { __contractStartupPerf?: StartupCounters };
	return (target.__contractStartupPerf ??= {});
}
export function measureStartupWork<T>(name: StartupWork, work: () => T): T {
	const counters = startupCounters();
	if (!counters) return work();
	const startedAt = performance.now();
	try {
		return work();
	} finally {
		const counter = (counters[name] ??= { count: 0, totalMs: 0 });
		counter.count++;
		counter.totalMs += performance.now() - startedAt;
	}
}
export function countStartupWork(name: StartupCount) {
	const counters = startupCounters();
	if (counters) (counters[name] ??= { count: 0 }).count++;
}

/** Fixed numeric work counters only; references let interactive queries update counts in place. */
export function recordDomainWork(domain: DocumentDomain) {
	if (!enabled() || typeof window === 'undefined') return;
	const target = window as typeof window & {
		__contractDomainPerf?: {
			ingestion: DocumentDomain['metrics'];
			geometry: NonNullable<DocumentDomain['geometry']>['metrics'] | undefined;
		};
	};
	target.__contractDomainPerf = { ingestion: domain.metrics, geometry: domain.geometry?.metrics };
}

export interface RenderPerfSample extends LayoutProfileMetrics {
	generation: number;
	sourceRevision: number;
	requestedAt: number;
	inputAt: number;
	renderStartedAt?: number;
	layoutEpoch?: string;
	compositionCompleteAt?: number;
	preparationCompleteAt?: number;
	paginationCompleteAt?: number;
	paintOpportunityAt?: number;
	inputToPaintOpportunityMs?: number;
	affectedContainers: number;
	blocksRecomposed: number;
	pagesReused: number;
	composeMs: number;
	prepareMs: number;
	profileResolveMs: number;
	paginateMs: number;
	reconcileMs: number;
	pagesChanged: number;
	pageCount: number;
	blocksProcessed: number;
	tokensProcessed: number;
	snapshotAt?: number;
	commitToDomMs: number;
	totalMs: number;
	settledTotalMs?: number;
	cancelled: boolean;
	failed: boolean;
}
let lastInputAt = 0;
export function recordContractInput(event: Event) {
	if (enabled()) lastInputAt = event.timeStamp;
}
export function createPerfSample(
	generation: number,
	sourceRevision: number
): RenderPerfSample | undefined {
	if (!enabled()) return;
	const requestedAt = performance.now();
	const inputAt = lastInputAt && requestedAt - lastInputAt < 1000 ? lastInputAt : requestedAt;
	lastInputAt = 0;
	return {
		generation,
		sourceRevision,
		requestedAt,
		inputAt,
		affectedContainers: 0,
		blocksRecomposed: 0,
		pagesReused: 0,
		composeMs: 0,
		prepareMs: 0,
		profileResolveMs: 0,
		profileCacheHits: 0,
		profileCacheMisses: 0,
		profileUniqueMisses: 0,
		profileBatchCount: 0,
		profileDomUpdateMs: 0,
		profileReadMs: 0,
		profileTotalMs: 0,
		maxProfileBlockMs: 0,
		paginateMs: 0,
		reconcileMs: 0,
		pagesChanged: 0,
		pageCount: 0,
		blocksProcessed: 0,
		tokensProcessed: 0,
		commitToDomMs: 0,
		totalMs: 0,
		cancelled: false,
		failed: false
	};
}
// Bounded, opt-in inspection without production logging or reactive dependencies.
export function recordPerfSample(sample?: RenderPerfSample) {
	if (!enabled() || !sample || typeof window === 'undefined') return;
	const target = window as typeof window & { __contractRenderPerf?: RenderPerfSample[] };
	const samples = (target.__contractRenderPerf ??= []);
	const index = samples.findIndex(
		(value) => value.generation === sample.generation && value.requestedAt === sample.requestedAt
	);
	if (index < 0) samples.push({ ...sample });
	else samples[index] = { ...sample };
	if (samples.length > 100) samples.shift();
}
