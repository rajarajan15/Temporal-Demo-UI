// Shapes from frontend-context.md sections 4 and 5.

export const TENANTS = ['bank-a', 'bank-b'] as const;
export type Tenant = (typeof TENANTS)[number];

export const PRODUCT_CODES = ['VIRTUAL_STANDARD', 'VIRTUAL_PREMIUM'] as const;
export type ProductCode = (typeof PRODUCT_CODES)[number];

export type CardStatus =
  | 'REQUESTED'
  | 'KYC_PASSED'
  | 'CREATED'
  | 'UNDER_REVIEW'
  | 'ACTIVE'
  | 'REJECTED'
  | 'CANCELLED'
  | 'BLOCKED'
  | 'PERSONALIZED'
  | 'IN_PRODUCTION'
  | 'SHIPPED'
  | 'DELIVERED';

export type StepState =
  | 'PENDING'
  | 'RUNNING'
  | 'WAITING'
  | 'PARKED'
  | 'DONE'
  | 'FAILED'
  | 'COMPENSATING'
  | 'COMPENSATED';

export interface Step {
  name: string;
  state: StepState;
  lastErrorCode: string | null;
  startedAtMillis: number | null;
  finishedAtMillis: number | null;
}

export type ReviewKind = 'KYC_REVIEW' | 'CONFIRMATION_TIMEOUT' | 'RETRIES_EXHAUSTED';
export type ReviewAction = 'APPROVE' | 'REJECT' | 'RETRY' | 'CANCEL';

export interface PendingReview {
  kind: ReviewKind;
  step: string | null;
  reasonCode: string | null;
  sinceMillis: number | null;
}

export interface Card {
  cardId: string;
  token: string | null;
}

export interface Progress {
  status: CardStatus;
  reasonCode: string | null;
  card: Card | null;
  steps: Step[];
  pendingReview: PendingReview | null;
  finished: boolean;
}

export interface CreateCardBody {
  cardType: 'VIRTUAL';
  productCode: string;
  customerRef: string;
  accountRef: string;
  spendLimitMinor: number;
}

export interface CreateCardReply {
  requestId: string;
  status: CardStatus;
}

export type ReissueReason = 'LOST' | 'STOLEN' | 'DAMAGED' | 'EXPIRED';
export const REISSUE_REASONS: ReissueReason[] = ['LOST', 'STOLEN', 'DAMAGED', 'EXPIRED'];

export interface ReissueBody {
  reason: ReissueReason;
  productCode: string;
  customerRef: string;
  accountRef: string;
  spendLimitMinor: number;
}

export interface ReissueReply {
  requestId: string;
  oldCardId: string;
  newCardRequestId: string;
  status: CardStatus;
}

export type DiscrepancyType = 'UNKNOWN_TO_PLATFORM' | 'MISSING_AT_PROCESSOR' | 'STATUS_MISMATCH';

export interface Discrepancy {
  cardId: string;
  type: DiscrepancyType;
  processorStatus: string | null;
  platformStatus: string | null;
}

export interface ReconReport {
  tenantId: string;
  businessDate: string;
  processorCards: number;
  platformCards: number;
  pagesRead: number;
  discrepancyCount: number;
  discrepancies: Discrepancy[];
}

export type ReconStatus = 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface ReconResult {
  status: ReconStatus;
  report?: ReconReport;
}

export interface ReconStartReply {
  runId: string;
  status: 'RUNNING' | 'ALREADY_STARTED';
}

export interface ScheduleTriggerReply {
  scheduleId: string;
  result: string;
}
