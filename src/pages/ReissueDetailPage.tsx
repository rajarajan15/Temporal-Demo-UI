import { Link, useParams } from 'react-router-dom';
import { ProgressBar } from '../components/ProgressSummary';
import { StatusHero } from '../components/StatusHero';
import { StepTimeline } from '../components/StepTimeline';
import { Callout, ErrorCallout, IdText, LiveIndicator, Spinner, StatusBadge, Switch } from '../components/ui';
import { describeProgress } from '../lib/describe';
import { errorMessage, REVIEW_KIND } from '../lib/labels';
import { useTrackedItem } from '../lib/store';
import { workflowUrl } from '../lib/temporal';
import { useTenant } from '../lib/tenant';
import { useProgress } from '../lib/useProgress';
import { useTechnical } from '../lib/useTechnical';

const REASON_TEXT: Record<string, string> = {
  LOST: 'Lost card',
  STOLEN: 'Stolen card',
  DAMAGED: 'Damaged card',
  EXPIRED: 'Expired card',
};

export function ReissueDetailPage() {
  const tenant = useTenant();
  const id = decodeURIComponent(useParams().id ?? '');
  const item = useTrackedItem(tenant, 'reissue', id);
  const { data: p, error, transient, polling, refresh } = useProgress(tenant, 'reissue', id);
  const [technical, setTechnical] = useTechnical();
  const newCardRequestId = item?.newCardRequestId ?? `${id}-new`;
  const blocks = item?.reissueReason === 'LOST' || item?.reissueReason === 'STOLEN';

  return (
    <div className="page">
      <div className="breadcrumbs">
        <Link to={`/${tenant}/requests`}>Requests</Link> <span aria-hidden>/</span> <span>Reissue</span>
      </div>

      <div className="page-head">
        <div className="detail-title">
          <h1>Replace {item?.reissueReason ? REASON_TEXT[item.reissueReason]?.toLowerCase() : 'card'}</h1>
          <span className="muted small">
            {blocks ? 'The old card is blocked, then a new one is issued and linked.' : 'A new card is issued and linked to the old one.'}
          </span>
        </div>
        <div className="head-side">
          {p && <LiveIndicator polling={polling} transient={!!transient} />}
          <Switch checked={technical} onChange={setTechnical} label="Technical details" />
        </div>
      </div>

      {transient && <Callout tone="warning" title={errorMessage(transient.code)}>Still trying…</Callout>}
      {error && (
        <ErrorCallout
          error={error}
          actions={
            <button className="btn btn-ghost btn-sm" onClick={refresh}>
              Try again
            </button>
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
          <StatusHero desc={describeProgress(p, 'reissue')} live={!p.finished} />
          <ReplacementStatus tenant={tenant} id={newCardRequestId} />

          <div className="detail-grid">
            <section className="card">
              <h2>Progress</h2>
              <ProgressBar steps={p.steps} finished={p.finished} />
              <StepTimeline steps={p.steps} finished={p.finished} technical={technical} />
            </section>

            <aside className="detail-side">
              <section className="card">
                <h2>Cards</h2>
                <dl className="kv">
                  <dt>Old card</dt>
                  <dd>{item?.oldCardId ? <IdText value={item.oldCardId} /> : <span className="muted">Unknown</span>}</dd>
                  <dt>New card</dt>
                  <dd>{p.card ? <IdText value={p.card.cardId} /> : <span className="muted">Not created yet</span>}</dd>
                  {technical && (
                    <>
                      <dt>Reissue ID</dt>
                      <dd>
                        <IdText value={id} />
                      </dd>
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
                      <dt>Workflow</dt>
                      <dd>
                        <a href={workflowUrl('reissue', tenant, id)} target="_blank" rel="noreferrer">
                          Open in Temporal ↗
                        </a>
                      </dd>
                    </>
                  )}
                </dl>
                {blocks && technical && (
                  <p className="muted small">The block shows only at the processor (see Simulator → Processor cards).</p>
                )}
              </section>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

/** The replacement is an ordinary card request and can pause for review like any other. */
function ReplacementStatus({ tenant, id }: { tenant: ReturnType<typeof useTenant>; id: string }) {
  const { data, error } = useProgress(tenant, 'card', id);
  const href = `/${tenant}/requests/${encodeURIComponent(id)}`;
  if (error?.status === 404 || !data) return null;

  const review = data.pendingReview && !data.finished ? data.pendingReview : null;
  return (
    <Callout
      tone={review ? 'warning' : 'neutral'}
      title={
        <>
          New card request <StatusBadge status={data.status} finished={data.finished} />
        </>
      }
      actions={
        <Link to={href} className={`btn btn-sm ${review ? 'btn-primary' : 'btn-ghost'}`}>
          {review ? 'Decide now' : 'View its steps'}
        </Link>
      }
    >
      {review
        ? `The replacement is waiting for a decision (${REVIEW_KIND[review.kind]?.title.toLowerCase() ?? review.kind}).`
        : 'The replacement is issued as its own card request.'}
    </Callout>
  );
}
