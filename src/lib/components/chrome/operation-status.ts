/** Presentation-only status. Each workspace supplies its own feedback and actions. */
export interface OperationStatus {
	message: string;
	urgent?: boolean;
	actions?: { label: string; run: () => void }[];
}
