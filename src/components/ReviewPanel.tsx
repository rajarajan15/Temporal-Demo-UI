import { useState } from 'react';
import { api, ApiError, isSafeRef, newKey } from '../api/client';
import type { PendingReview, ReviewAction, Tenant } from '../api/types';
import { markDone } from '../guide/Checklist';
import { formatDateTime, timeAgo } from '../lib/format';
import { errorMessage, REVIEW_KIND } from '../lib/labels';
import { prefs } from '../lib/store';
import { Callout, Spinner } from './ui';

const ACTION: Record<ReviewAction, { label: string; style: string; done: string }> = {
  APPROVE: { label: 'Approve', style: 'btn-primary', done: 'Approved. The card is being issued.' },
  RETRY: { label: 'Retry the step', style: 'btn-primary', done: 'Retrying the step.' },
  REJECT: { label: 'Reject', style: 'btn-danger-ghost', done: 'Rejected.' },
  CANCEL: { label: 'Cancel and undo', style: 'btn-danger-ghost', done: 'Cancelling and undoing completed steps.' },
};

interface Attempt {
  action: ReviewAction;
  key: string;
}

/** Decision buttons for a parked request. Shown inside the status banner. */
export function ReviewActions({
  tenant,
  requestId,
  review,
  onDecided,
}: {
  tenant: Tenant;
  requestId: string;
  review: PendingReview;
  onDecided: () => void;
}) {
  const actions = REVIEW_KIND[review.kind]?.actions ?? [];
  const [reviewer, setReviewer] = useState(() => prefs.get('reviewer', 'ops-1'));
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<ReviewAction | null>(null);
  // Kept after a 503 so the retry reuses the same Idempotency-Key.
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [result, setResult] = useState<{ tone: 'success' | 'warning' | 'danger'; text: string } | null>(null);
  const reviewerOk = isSafeRef(reviewer);

  async function decide(action: ReviewAction) {
    if (!reviewerOk) return;
    const key = attempt?.action === action ? attempt.key : newKey();
    setAttempt({ action, key });
    setBusy(action);
    setResult(null);
    prefs.set('reviewer', reviewer);
    try {
      await api.decide(tenant, requestId, key, action, reviewer);
      setAttempt(null);
      markDone('review');
      setResult({ tone: 'success', text: ACTION[action].done });
      onDecided();
    } catch (e) {
      const err = e as ApiError;
      if (err.isUnavailable) {
        setResult({ tone: 'warning', text: `${errorMessage(err.code)} Press the button again to retry safely.` });
      } else {
        setAttempt(null);
        setResult({ tone: 'danger', text: errorMessage(err.code) });
        onDecided(); // someone else may have decided; show the latest state
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="review" data-tour="review">
      <div className="btn-row">
        {actions.map((a) => (
          <button
            key={a}
            type="button"
            className={`btn ${ACTION[a].style}`}
            disabled={!!busy || !reviewerOk}
            onClick={() => void decide(a)}
          >
            {busy === a && <Spinner />}
            {ACTION[a].label}
          </button>
        ))}
      </div>
      <div className="review-meta muted small">
        {editing ? (
          <span className="reviewer-edit">
            Deciding as{' '}
            <input
              autoFocus
              aria-label="Reviewer name"
              value={reviewer}
              onChange={(e) => setReviewer(e.target.value.trim())}
              onBlur={() => reviewerOk && setEditing(false)}
              onKeyDown={(e) => e.key === 'Enter' && reviewerOk && setEditing(false)}
              className={reviewerOk ? '' : 'input-error'}
            />
            {!reviewerOk && <span className="text-danger"> letters, digits, - or _</span>}
          </span>
        ) : (
          <span>
            Deciding as <strong>{reviewer}</strong>{' '}
            <button type="button" className="link-btn" onClick={() => setEditing(true)}>
              change
            </button>
          </span>
        )}
        {review.sinceMillis && <span title={formatDateTime(review.sinceMillis)}> · waiting {timeAgo(review.sinceMillis).replace(' ago', '')}</span>}
      </div>
      {result && <Callout tone={result.tone}>{result.text}</Callout>}
    </div>
  );
}
