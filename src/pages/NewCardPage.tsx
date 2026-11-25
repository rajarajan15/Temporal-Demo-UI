import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError, isSafeRef, newKey } from '../api/client';
import { CardFields, checkCardForm, PRODUCTS, toFormValues, toInput, toMinor, type CardFormValues } from '../components/CardFields';
import { Callout, Field, Spinner } from '../components/ui';
import { errorMessage } from '../lib/labels';
import { tracked } from '../lib/store';
import { TENANT_NAMES, useTenant } from '../lib/tenant';
import { SCENARIOS, scenarioOf, suffix } from '../lib/scenarios';
import { isSimActive, useSim } from '../lib/simState';

const DEFAULTS = (): CardFormValues => ({
  productCode: 'VIRTUAL_STANDARD',
  customerRef: `customer-${suffix()}`,
  accountRef: 'account-1',
  spendLimit: '500.00',
});

export function NewCardPage() {
  const tenant = useTenant();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [values, setValues] = useState<CardFormValues>(() => {
    const from = params.get('from');
    const prev = from ? tracked.get(tenant, 'card', from)?.input : undefined;
    const start = prev ? toFormValues(prev) : DEFAULTS();
    const s = SCENARIOS.find((x) => x.id === params.get('scenario'));
    return s ? s.apply(start) : start;
  });
  // Re-apply when a guide link changes the scenario while already on this page.
  useEffect(() => {
    const s = SCENARIOS.find((x) => x.id === params.get('scenario'));
    if (s) setValues((v) => s.apply(v));
  }, [params]);

  // One key per new request, kept across transient failures so a retry can't create a duplicate.
  const [key, setKey] = useState(newKey);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const simState = useSim(tenant);
  const check = checkCardForm(values);
  const keyOk = isSafeRef(key);
  const blocked = Object.keys(check.errors).length > 0 || !keyOk;
  const scenario = SCENARIOS.find((s) => s.id === scenarioOf(values))!;
  const product = PRODUCTS.find((p) => p.code === values.productCode);
  const limit = toMinor(values.spendLimit);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (blocked) return;
    const input = toInput(values);
    setBusy(true);
    setError(null);
    try {
      await api.createCard(tenant, key, { cardType: 'VIRTUAL', ...input });
      tracked.upsert({ id: key, tenant, kind: 'card', input, lastStatus: 'REQUESTED' });
      navigate(`/${tenant}/requests/${encodeURIComponent(key)}`);
    } catch (err) {
      const apiErr = err as ApiError;
      setError(apiErr);
      // A 4xx means nothing was created; use a fresh key next time.
      if (apiErr.status >= 400 && apiErr.status < 500) setKey(newKey());
    } finally {
      setBusy(false);
    }
  }

  const transient = error && (error.isUnavailable || error.status === 0 || error.code === 'BACKEND_UNREACHABLE');

  return (
    <form className="page" onSubmit={(e) => void submit(e)} noValidate>
      <div className="page-head">
        <div>
          <h1>Issue a virtual card</h1>
          <p className="page-sub">Two quick choices, then issue. The details are already filled in with test data.</p>
        </div>
      </div>

      <div className="new-grid">
        <div className="new-main">
          <section className="card" data-tour="scenarios">
            <div className="step-head">
              <span className="step-num">1</span>
              <div>
                <h2>What should happen?</h2>
                <p className="muted small">This is a test environment, so you choose the outcome.</p>
              </div>
            </div>
            <div className="scenario-pick" role="radiogroup" aria-label="Outcome">
              {SCENARIOS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={scenario.id === s.id}
                  className={`pick pick-${s.id}${scenario.id === s.id ? ' selected' : ''}`}
                  onClick={() => setValues(s.apply(values))}
                >
                  <span className="pick-icon" aria-hidden>
                    {s.icon}
                  </span>
                  <span className="pick-title">{s.title}</span>
                  <span className="pick-text">{s.text}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="card" data-tour="card-details">
            <div className="step-head">
              <span className="step-num">2</span>
              <div>
                <h2>Card details</h2>
                <p className="muted small">Prefilled for you. Change anything you like.</p>
              </div>
            </div>
            <CardFields values={values} onChange={setValues} check={check} showErrors={submitted} allowCustomProduct />

            <details className="advanced">
              <summary>Advanced: request ID</summary>
              <Field
                label="Request ID (Idempotency-Key)"
                htmlFor="idem"
                error={!keyOk ? 'Use 1 to 64 letters, digits, - or _, without long runs of digits.' : null}
                hint="Generated for you. Using an existing ID opens that request instead of creating a new one."
              >
                <div className="input-combo">
                  <input id="idem" value={key} onChange={(e) => setKey(e.target.value.trim())} className="mono" />
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setKey(newKey())}>
                    Regenerate
                  </button>
                </div>
              </Field>
            </details>
          </section>
        </div>

        <aside className="new-side">
          <section className="card summary" data-tour="summary">
            <h2>Summary</h2>
            <dl className="summary-list">
              <div>
                <dt>Bank</dt>
                <dd>{TENANT_NAMES[tenant]}</dd>
              </div>
              <div>
                <dt>Card</dt>
                <dd>{product ? `${product.name} virtual card` : values.productCode || '—'}</dd>
              </div>
              <div>
                <dt>Spend limit</dt>
                <dd>{limit !== null ? (limit / 100).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—'}</dd>
              </div>
              <div>
                <dt>Customer</dt>
                <dd className="mono">{values.customerRef || '—'}</dd>
              </div>
            </dl>
            <div className={`expect expect-${scenario.id}`}>
              <strong>What to expect</strong>
              <span>{scenario.expect}</span>
            </div>

            {isSimActive(simState) && (
              <Callout tone="warning" title="Simulator is on">
                The outcome may differ from the above. <Link to={`/${tenant}/demo`}>See what's on</Link>
              </Callout>
            )}
            {error && (
              <Callout tone={transient ? 'warning' : 'danger'} title={errorMessage(error.code)}>
                {transient ? 'Press Issue card again. It\'s safe: the same request ID is reused.' : <code>{error.code}</code>}
              </Callout>
            )}
            {submitted && blocked && <Callout tone="danger">Fix the highlighted fields first.</Callout>}

            <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
              {busy && <Spinner />} {transient ? 'Try again' : 'Issue card'}
            </button>
            <p className="muted small center">You'll see its progress live.</p>
          </section>
        </aside>
      </div>
    </form>
  );
}
