import type { CardStatus, ReviewAction, ReviewKind, StepState } from '../api/types';

export const STEP_LABELS: Record<string, string> = {
  validateRequest: 'Validate request',
  runKyc: 'KYC check',
  createCard: 'Create card',
  awaitConfirmation: 'Processor confirmation',
  setLimits: 'Set limits',
  activateCard: 'Activate card',
  sendNotification: 'Notify customer',
  cancelCard: 'Undo: cancel card',
  resetLimits: 'Undo: reset limits',
  deactivateCard: 'Undo: deactivate card',
  blockOldCard: 'Block old card',
  issueNewCard: 'Issue replacement card',
  linkCards: 'Link old and new card',
};

export const UNDO_STEPS = new Set(['cancelCard', 'resetLimits', 'deactivateCard']);

export const stepLabel = (name: string) => STEP_LABELS[name] ?? name;

export const STATUS_LABELS: Record<CardStatus, string> = {
  REQUESTED: 'Requested',
  KYC_PASSED: 'KYC passed',
  CREATED: 'Created',
  UNDER_REVIEW: 'Under review',
  ACTIVE: 'Active',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  BLOCKED: 'Blocked',
  PERSONALIZED: 'Personalized',
  IN_PRODUCTION: 'In production',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
};

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export function statusTone(status: string | undefined, finished?: boolean): Tone {
  switch (status) {
    case 'ACTIVE':
      return 'success';
    case 'REJECTED':
      return 'danger';
    case 'CANCELLED':
      return 'neutral';
    case 'UNDER_REVIEW':
      // Final UNDER_REVIEW means COMPENSATION_FAILED / REPLACEMENT_FAILED.
      return finished ? 'danger' : 'warning';
    case 'EXPIRED':
      return 'neutral';
    default:
      return 'info';
  }
}

export const STEP_STATE_TONE: Record<StepState, Tone> = {
  PENDING: 'neutral',
  RUNNING: 'info',
  WAITING: 'info',
  PARKED: 'warning',
  DONE: 'success',
  FAILED: 'danger',
  COMPENSATING: 'warning',
  COMPENSATED: 'neutral',
};

export const REASON_LABELS: Record<string, string> = {
  INVALID_REQUEST: 'The request was invalid.',
  INVALID_PRODUCT: 'The product code is not supported.',
  LIMIT_EXCEEDS_POLICY: 'The spend limit is outside policy (0.01 to 10,000.00).',
  KYC_REJECTED: 'KYC refused the customer.',
  KYC_NEEDS_REVIEW: 'KYC could not decide and needs an operator.',
  CONFIRMATION_TIMEOUT: 'The processor did not confirm the card in time.',
  RETRIES_EXHAUSTED: 'A step kept failing and retries ran out.',
  REJECTED_BY_REVIEWER: 'An operator rejected the request.',
  CANCELLED_BY_REQUEST: 'Cancelled through the cancel endpoint.',
  CANCELLED_BY_OPERATOR: 'An operator cancelled it after retries ran out.',
  COMPENSATION_FAILED: 'Rollback failed. Manual cleanup is needed.',
  REPLACEMENT_FAILED: 'The reissue could not start the replacement card.',
  CARD_NOT_FOUND: 'The card to reissue does not exist.',
};

export const reasonLabel = (code: string) => REASON_LABELS[code] ?? 'Business refusal from the processor.';

export const REVIEW_KIND: Record<ReviewKind, { title: string; help: string; actions: ReviewAction[] }> = {
  KYC_REVIEW: {
    title: 'KYC review',
    help: 'KYC could not decide on this customer. Approve to continue issuing, or reject.',
    actions: ['APPROVE', 'REJECT'],
  },
  CONFIRMATION_TIMEOUT: {
    title: 'Confirmation timeout',
    help: 'The processor did not confirm the card in time. A late confirmation clears this automatically.',
    actions: ['APPROVE', 'REJECT'],
  },
  RETRIES_EXHAUSTED: {
    title: 'Retries exhausted',
    help: 'A step kept failing. Retry it, or cancel the request and undo completed steps.',
    actions: ['RETRY', 'CANCEL'],
  },
};

/** Human messages for error codes returned by the API. */
export const ERROR_MESSAGES: Record<string, string> = {
  NETWORK_ERROR: 'Could not reach the dev server.',
  BACKEND_UNREACHABLE: 'The backend is not reachable. Is it running (infra\\scripts\\restart-all.cmd)?',
  UNKNOWN_TENANT: 'Unknown tenant.',
  INVALID_REQUEST: 'The backend rejected the request as invalid.',
  UNSUPPORTED_CARD_TYPE: 'Only virtual cards are supported.',
  ENGINE_UNAVAILABLE: 'The workflow engine (Temporal) is unavailable. Try again shortly.',
  WORKER_UNAVAILABLE: 'The worker is unavailable. The decision may still be applied later. Retry with the same key.',
  PROGRESS_UNAVAILABLE: 'The worker is down. The request continues when it returns.',
  NOT_FOUND: 'Not found for this tenant. It may have been deleted after the 24-hour retention period.',
  WORKFLOW_FAILED: 'Backend defect: the workflow failed.',
  NO_REVIEW_PENDING: 'Nothing to decide. Someone may already have decided.',
  ACTION_NOT_ALLOWED: 'That action is not allowed for this review.',
  ALREADY_FINISHED: 'The request has already finished.',
  CANNOT_CANCEL: 'The card is already active, so it cannot be cancelled. Reissue it instead.',
  RESULT_UNAVAILABLE: 'The result is temporarily unavailable.',
  SCHEDULE_UNAVAILABLE: 'The reconciliation schedule is unavailable.',
};

export const errorMessage = (code: string) => ERROR_MESSAGES[code] ?? code;
