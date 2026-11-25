import { useState } from 'react';
import { api, ApiError, CARD_NUMBER_IN_TEXT, newKey } from '../api/client';
import type { Tenant } from '../api/types';
import { errorMessage } from '../lib/labels';
import { Callout, Field, Spinner } from './ui';

export function CancelPanel({
  tenant,
  requestId,
  onCancelled,
}: {
  tenant: Tenant;
  requestId: string;
  onCancelled: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('customer-request');
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'success' | 'warning' | 'danger'; text: string } | null>(null);

  const reasonError =
    reason.length > 200
      ? 'At most 200 characters.'
      : CARD_NUMBER_IN_TEXT.test(reason)
        ? 'Must not contain anything that looks like a card number.'
        : null;

  async function submit() {
    if (reasonError) return;
    const k = key ?? newKey();
    setKey(k);
    setBusy(true);
    setMsg(null);
    try {
      await api.cancel(tenant, requestId, k, reason.trim() || undefined);
      setKey(null);
      setOpen(false);
      setMsg({ tone: 'success', text: 'Cancellation accepted. Completed steps are being undone.' });
      onCancelled();
    } catch (e) {
      const err = e as ApiError;
      if (!err.isUnavailable) setKey(null);
      setMsg({ tone: err.isUnavailable ? 'warning' : 'danger', text: errorMessage(err.code) });
      if (!err.isUnavailable) onCancelled();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cancel-panel">
      {!open ? (
        <button type="button" className="btn btn-danger-ghost" onClick={() => setOpen(true)}>
          Cancel request…
        </button>
      ) : (
        <div className="panel panel-danger">
          <h3>Cancel this request?</h3>
          <p className="panel-text">
            The request ends <strong>Cancelled</strong> and any completed steps are undone. This is only possible
            until the card is active.
          </p>
          <Field label="Reason (optional)" htmlFor="cancel-reason" error={reasonError}>
            <input id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={220} />
          </Field>
          <div className="btn-row">
            <button type="button" className="btn btn-danger" disabled={busy || !!reasonError} onClick={() => void submit()}>
              {busy && <Spinner />} {key && msg?.tone === 'warning' ? 'Retry cancel' : 'Cancel request'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)} disabled={busy}>
              Keep it
            </button>
          </div>
        </div>
      )}
      {msg && <Callout tone={msg.tone}>{msg.text}</Callout>}
    </div>
  );
}
