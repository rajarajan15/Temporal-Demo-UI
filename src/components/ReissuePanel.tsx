import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError, newKey } from '../api/client';
import { REISSUE_REASONS, type ReissueReason, type ReissueReply, type Tenant } from '../api/types';
import { errorMessage } from '../lib/labels';
import { tracked, type CardInput } from '../lib/store';
import { CardFields, checkCardForm, toFormValues, toMinor, type CardFormValues } from './CardFields';
import { Callout, Field, Spinner } from './ui';

const REASON_HELP: Record<ReissueReason, string> = {
  LOST: 'The old card is blocked first.',
  STOLEN: 'The old card is blocked first.',
  DAMAGED: 'The old card is not blocked.',
  EXPIRED: 'The old card is not blocked.',
};

const DEFAULTS: CardInput = {
  productCode: 'VIRTUAL_STANDARD',
  customerRef: 'customer-1',
  accountRef: 'account-1',
  spendLimitMinor: 50000,
};

export function ReissuePanel({
  tenant,
  cardId,
  initial,
  defaultOpen = false,
}: {
  tenant: Tenant;
  cardId: string;
  defaultOpen?: boolean;
  initial?: CardInput;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(defaultOpen);
  const [reason, setReason] = useState<ReissueReason>('LOST');
  const [values, setValues] = useState<CardFormValues>(toFormValues(initial ?? DEFAULTS));
  const [key, setKey] = useState(newKey);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const check = checkCardForm(values);
  const blocked = Object.keys(check.errors).length > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (blocked) return;
    const input: CardInput = {
      productCode: values.productCode,
      customerRef: values.customerRef,
      accountRef: values.accountRef,
      spendLimitMinor: toMinor(values.spendLimit)!,
    };
    setBusy(true);
    setError(null);
    try {
      const { status, data } = await api.reissue(tenant, cardId, key, { reason, ...input });
      const newCardRequestId = status === 201 ? (data as ReissueReply).newCardRequestId : `${key}-new`;
      tracked.upsert({
        id: key,
        tenant,
        kind: 'reissue',
        oldCardId: cardId,
        newCardRequestId,
        reissueReason: reason,
        input,
        lastStatus: 'REQUESTED',
      });
      tracked.upsert({ id: newCardRequestId, tenant, kind: 'card', input, reissueId: key, lastStatus: 'REQUESTED' });
      navigate(`/${tenant}/reissues/${encodeURIComponent(key)}`);
    } catch (err) {
      const apiErr = err as ApiError;
      setError(apiErr);
      // Keep the key on transient errors so a retry can't create a second reissue.
      if (!apiErr.isUnavailable && apiErr.status !== 0) setKey(newKey());
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>
        Reissue this card…
      </button>
    );
  }

  return (
    <form className="panel" onSubmit={(e) => void submit(e)} noValidate>
      <div className="panel-head">
        <div>
          <div className="eyebrow">Replace card</div>
          <h2>Reissue</h2>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      <p className="panel-text">
        Issues a replacement card and links it to this one. Details are copied from the original request.
      </p>

      <Field label="Reason" hint={REASON_HELP[reason]}>
        <div className="segmented" role="radiogroup" aria-label="Reissue reason">
          {REISSUE_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={reason === r}
              className={reason === r ? 'active' : ''}
              onClick={() => setReason(r)}
            >
              {r.charAt(0) + r.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </Field>

      <CardFields values={values} onChange={setValues} check={check} showErrors={submitted} />

      {error && <Callout tone={error.isUnavailable ? 'warning' : 'danger'} title={errorMessage(error.code)}><code>{error.code}</code></Callout>}

      <div className="btn-row">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy && <Spinner />} Reissue card
        </button>
      </div>
    </form>
  );
}
