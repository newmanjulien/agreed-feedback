import type { Doc, Id } from '../../convex/_generated/dataModel';
import type { Infer } from 'convex/values';
import type * as validators from '../../convex/playbookValidators';

export type { SourcePoint, SourceRange } from '../contract/source-model';
export type Trigger = Infer<typeof validators.trigger>;
export type Instructions = Infer<typeof validators.instructions>;
export type ContractChange = Infer<typeof validators.contractChange>;
export type Concession = Infer<typeof validators.concession>;
export type PlaybookItem = Infer<typeof validators.playbookItem>;
export type PlaybookItemId = Id<'playbookItems'>;
export type PlaybookItemRecord = Doc<'playbookItems'>;

/** Generate once on authoring, never during rendering or projection. */
export const newTriggerId = (): string => crypto.randomUUID();
export const newConcessionId = (): string => crypto.randomUUID();
