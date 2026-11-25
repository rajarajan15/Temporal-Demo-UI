import { useEffect } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { CancelPanel } from '../components/CancelPanel';
import { ProgressBar } from '../components/ProgressSummary';
import { ReissuePanel } from '../components/ReissuePanel';
import { ReviewActions } from '../components/ReviewPanel';
import { StatusHero } from '../components/StatusHero';
import { StepTimeline } from '../components/StepTimeline';
import { Callout, ErrorCallout, IdText, LiveIndicator, Spinner, Switch } from '../components/ui';
import { useTour } from '../guide/TourProvider';
import { describeProgress } from '../lib/describe';
import { formatDateTime, formatMinor } from '../lib/format';
import { errorMessage } from '../lib/labels';
import { tracked, useTracked, useTrackedItem } from '../lib/store';
import { workflowUrl } from '../lib/temporal';
import { useTenant } from '../lib/tenant';
import { useProgress } from '../lib/useProgress';
import { useTechnical } from '../lib/useTechnical';

const PRODUCT_NAME: Record<string, string> = { VIRTUAL_STANDARD: 'Standard virtual card', VIRTUAL_PREMIUM: 'Premium virtual card' };

export function RequestDetailPage() {
  const tenant = useTenant();
  const navigate = useNavigate();
  const { hash } = useLocation();
  const id = decodeURIComponent(useParams().id ?? '');
  const item = useTrackedItem(tenant, 'card', id);
  const { data: p, error, transient, polling, refresh } = useProgress(tenant, 'card', id);
  const [technical, setTechnical] = useTechnical();
  const { start, seen, active } = useTour();

  // First time on a request page: explain it.
  const loaded = !!p;
  useEffect(() => {
    if (loaded && !active && !seen('request')) {
      const t = setTimeout(() => start('request'), 800);
      return () => clearTimeout(t);
    }
  }, [loaded, active, seen, start]);

  const all = useTracked();
  // The backend doesn't stop a second reissue of the same card (it would issue two replacements),
  // so the UI blocks it for cards it knows were already reissued.
  const replacedBy = p?.card
    ? all
        .filter((i) => i.tenant === tenant && i.kind === 'reissue' && i.oldCardId === p.card!.cardId && !i.gone)
        .filter((i) => !(i.finished && i.lastStatus !== 'ACTIVE'))
        .sort((a, b) => b.createdAt - a.createdAt)[0]
    : undefined;

  const canCancel = p && !p.finished && p.status !== 'ACTIVE';
  const canReissue = p && p.status === 'ACTIVE' && p.card && !replacedBy;
  const review = p && p.pendingReview && !p.finished ? p.pendingReview : null;
  const failedOrCancelled = p?.finished && (p.status === 'REJECTED' || p.status === 'CANCELLED');

  return (
    <div className="page">
      <div className="breadcrumbs">
        <Link to={`/${tenant}/requests`}>Requests</Link> <span aria-hidden>/</span>{' '}
        <span>{item?.input ? `Card for ${item.input.customerRef}` : 'Card request'}</span>
      </div>

      <div className="page-head">
        <div className="detail-title">
          <h1>{item?.input ? PRODUCT_NAME[item.input.productCode] ?? 'Virtual card' : 'Card request'}</h1>
          <span className="muted small">
            {item?.input ? `For ${item.input.customerRef} · limit ${formatMinor(item.input.spendLimitMinor)}` : `Request ${id}`}
          </span>
        </div>
        <div className="head-side">
          {p && <LiveIndicator polling={polling} transient={!!transient} />}
          <Switch checked={technical} onChange={setTechnical} label="Technical details" data-tour="tech-toggle" />
        </div>
      </div>

      {transient && (
        <Callout tone="warning" title={errorMessage(transient.code)}>
          Still trying. The request carries on in the background and this page catches up automatically.
        </Callout>
      )}

      {error && (
        <ErrorCallout
          error={error}
          title={error.status === 404 ? 'This request no longer exists' : undefined}
          actions={
            <>
              <button className="btn btn-ghost btn-sm" onClick={refresh}>
                Try again
              </button>
              {item && error.status === 404 && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    tracked.remove(tenant, 'card', id);
                    navigate(`/${tenant}/requests`);
                  }}
                >
                  Remove from list
                </button>
              )}
            </>
          }
        />
      )}

      {!p && !error && (
        <div className="card loading-card">
          <Spinner /> Loading…
        </div>
      )}

      {p && (
        <>
          <StatusHero
            desc={
              replacedBy && p.status === 'ACTIVE'
                ? {
                    tone: 'neutral',
                    icon: '⇄',
                    title: replacedBy.finished ? 'This card has been replaced' : 'This card is being replaced',
                    text:
                      replacedBy.reissueReason === 'LOST' || replacedBy.reissueReason === 'STOLEN'
                        ? `It was reported ${replacedBy.reissueReason.toLowerCase()}, so it's blocked at the processor. Use the replacement card instead.`
                        : `It was reissued (${(replacedBy.reissueReason ?? '').toLowerCase()}). Use the replacement card instead.`,
                  }
                : describeProgress(p)
            }
            live={!p.finished}
          >
            {review ? (
              <ReviewActions
                key={`${review.kind}-${review.sinceMillis}`}
                tenant={tenant}
                requestId={id}
                review={review}
                onDecided={refresh}
              />
            ) : replacedBy && p.status === 'ACTIVE' ? (
              <div className="btn-row">
                <Link to={`/${tenant}/reissues/${encodeURIComponent(replacedBy.id)}`} className="btn btn-primary btn-sm">
                  See the replacement
                </Link>
              </div>
            ) : p.finished ? (
              <div className="btn-row">
                {failedOrCancelled && item?.input && (
                  <Link to={`/${tenant}/new?from=${encodeURIComponent(id)}&scenario=approved`} className="btn btn-primary btn-sm">
                    Try again with these details
                  </Link>
                )}
                <Link to={`/${tenant}/new`} className={`btn btn-sm ${failedOrCancelled ? 'btn-ghost' : 'btn-secondary'}`}>
                  Issue another card
                </Link>
              </div>
            ) : null}
          </StatusHero>

          <div className="detail-grid">
            <section className="card" data-tour="timeline">
              <div className="card-head">
                <h2>Progress</h2>
              </div>
              <ProgressBar steps={p.steps} finished={p.finished} />
              <StepTimeline steps={p.steps} finished={p.finished} technical={technical} />
            </section>

            <aside className="detail-side">
              {(canCancel || canReissue) && (
                <section className="card" data-tour="actions">
                  <h2>Actions</h2>
                  {canCancel && <CancelPanel tenant={tenant} requestId={id} onCancelled={refresh} />}
                  {canReissue && (
                    <ReissuePanel tenant={tenant} cardId={p.card!.cardId} initial={item?.input} defaultOpen={hash === '#reissue'} />
                  )}
                </section>
              )}

              <section className="card">
                <h2>Details</h2>
                <dl className="kv">
                  {item?.input && (
                    <>
                      <dt>Customer</dt>
                      <dd>{item.input.customerRef}</dd>
                      <dt>Account</dt>
                      <dd>{item.input.accountRef}</dd>
                      <dt>Spend limit</dt>
                      <dd>{formatMinor(item.input.spendLimitMinor)}</dd>
                    </>
                  )}
                  <dt>Card ID</dt>
                  <dd>{p.card ? <IdText value={p.card.cardId} /> : <span className="muted">Not created yet</span>}</dd>
                  {item?.reissueId && (
                    <>
                      <dt>Replaces</dt>
                      <dd>
                        <Link to={`/${tenant}/reissues/${encodeURIComponent(item.reissueId)}`}>See the reissue →</Link>
                      </dd>
                    </>
                  )}
                  {technical && (
                    <>
                      <dt>Request ID</dt>
                      <dd>
                        <IdText value={id} />
                      </dd>
                      {p.card?.token && (
                        <>
                          <dt>Token</dt>
                          <dd>
                            <IdText value={p.card.token} />
                          </dd>
                        </>
                      )}
                      <dt>Status code</dt>
                      <dd>
                        <code>{p.status}</code>
                        {p.reasonCode && (
                          <>
                            {' '}
                            · <code>{p.reasonCode}</code>
                          </>
                        )}
                      </dd>
                      {item?.input && (
                        <>
                          <dt>Product code</dt>
                          <dd>
                            <code>{item.input.productCode}</code>
                          </dd>
                        </>
                      )}
                      {item && (
                        <>
                          <dt>Created</dt>
                          <dd className="small">{formatDateTime(item.createdAt)}</dd>
                        </>
                      )}
                      <dt>Workflow</dt>
                      <dd>
                        <a href={workflowUrl('card', tenant, id)} target="_blank" rel="noreferrer">
                          Open in Temporal ↗
                        </a>
                      </dd>
                    </>
                  )}
                </dl>
              </section>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
