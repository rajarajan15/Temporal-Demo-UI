import type { Progress } from '../api/types';
import type { Tone } from './labels';
import { stepLabel, UNDO_STEPS } from './labels';
import type { TrackedItem } from './store';

/** Plain-language reasons, written for operators rather than engineers. */
const PLAIN_REASON: Record<string, string> = {
  INVALID_REQUEST: 'Some of the request details were invalid.',
  INVALID_PRODUCT: 'The product isn\'t one this bank offers.',
  LIMIT_EXCEEDS_POLICY: 'The spend limit is outside what policy allows (0.01 to 10,000.00).',
  KYC_REJECTED: 'The customer failed the identity check.',
  KYC_NEEDS_REVIEW: 'The identity check couldn\'t decide.',
  CONFIRMATION_TIMEOUT: 'The processor didn\'t confirm the card in time.',
  RETRIES_EXHAUSTED: 'A step kept failing.',
  REJECTED_BY_REVIEWER: 'An operator rejected it.',
  CANCELLED_BY_REQUEST: 'It was cancelled on request.',
  CANCELLED_BY_OPERATOR: 'An operator cancelled it after a step kept failing.',
  COMPENSATION_FAILED: 'Undoing the completed steps failed. Someone needs to clean up manually.',
  REPLACEMENT_FAILED: 'The replacement card couldn\'t be started.',
  CARD_NOT_FOUND: 'The card to replace doesn\'t exist.',
  ACTIVATION_DECLINED: 'The processor declined to activate the card.',
};

export const plainReason = (code: string | null | undefined) =>
  code ? (PLAIN_REASON[code] ?? `The processor refused it (${code}).`) : '';

export interface Description {
  tone: Tone;
  icon: string;
  title: string;
  text: string;
}

export function describeProgress(p: Progress, kind: 'card' | 'reissue' = 'card'): Description {
  const noun = kind === 'reissue' ? 'Replacement' : 'Card';
  if (!p.finished && p.pendingReview) {
    const text: Record<string, string> = {
      KYC_REVIEW: 'The identity check couldn\'t decide about this customer. Approve to continue issuing the card, or reject it.',
      CONFIRMATION_TIMEOUT:
        'The processor didn\'t confirm the new card in time. Approve to carry on, or reject. If the confirmation arrives late, this clears by itself.',
      RETRIES_EXHAUSTED: `"${stepLabel(p.pendingReview.step ?? '')}" kept failing. Retry it, or cancel the request and undo what was done.`,
    };
    return { tone: 'warning', icon: '!', title: 'Waiting for your decision', text: text[p.pendingReview.kind] ?? '' };
  }
  if (!p.finished) {
    const main = p.steps.filter((s) => !UNDO_STEPS.has(s.name));
    const undoing = p.steps.some((s) => UNDO_STEPS.has(s.name) && s.state !== 'PENDING');
    if (undoing) return { tone: 'warning', icon: '↺', title: 'Undoing completed steps…', text: 'The request is being rolled back.' };
    const current = main.find((s) => ['RUNNING', 'WAITING', 'PARKED'].includes(s.state)) ?? main.find((s) => s.state === 'PENDING');
    const pos = current ? main.indexOf(current) + 1 : main.length;
    const waiting = current?.state === 'WAITING';
    return {
      tone: 'info',
      icon: '',
      title: kind === 'reissue' ? 'Replacing the card…' : 'Issuing the card…',
      text: current
        ? `Step ${pos} of ${main.length}: ${waiting ? 'waiting for the processor to confirm' : stepLabel(current.name).toLowerCase()}. This usually takes about a second.`
        : 'Starting up…',
    };
  }
  switch (p.status) {
    case 'ACTIVE':
      return {
        tone: 'success',
        icon: '✓',
        title: `${noun} is active`,
        text:
          kind === 'reissue'
            ? 'The replacement card is live and linked to the old one.'
            : p.steps.some((s) => s.name === 'sendNotification' && s.state === 'FAILED')
              ? 'The card is ready to use. The customer notification failed, but that doesn\'t affect the card.'
              : 'The card is ready to use.',
      };
    case 'REJECTED':
      return { tone: 'danger', icon: '✕', title: 'Request rejected', text: withUndo(plainReason(p.reasonCode), p) };
    case 'CANCELLED':
      return { tone: 'neutral', icon: '–', title: 'Request cancelled', text: withUndo(plainReason(p.reasonCode), p) };
    case 'UNDER_REVIEW':
      return { tone: 'danger', icon: '!', title: 'Needs manual cleanup', text: plainReason(p.reasonCode) };
    default:
      return { tone: 'neutral', icon: '', title: p.status, text: plainReason(p.reasonCode) };
  }
}

function withUndo(text: string, p: Progress) {
  return p.steps.some((s) => UNDO_STEPS.has(s.name)) ? `${text} Everything that was already done has been undone.` : text;
}

/** One-line summary for list rows. */
export function describeItem(i: TrackedItem): string {
  if (i.gone) return 'Expired: removed by the backend after 24 hours';
  if (i.parked && !i.finished) return `Waiting for your decision. ${plainReason(i.reasonCode)}`;
  if (!i.finished) return 'In progress…';
  if (i.lastStatus === 'ACTIVE') return i.kind === 'reissue' ? 'Replacement card is active' : 'Card is active';
  return plainReason(i.reasonCode) || '';
}

export const needsDecision = (i: TrackedItem) =>
  !i.gone && ((i.parked && !i.finished) || (i.finished && i.lastStatus === 'UNDER_REVIEW'));
