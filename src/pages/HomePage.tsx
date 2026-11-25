import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { RequestItem } from '../components/RequestItem';
import { Checklist } from '../guide/Checklist';
import { useTour } from '../guide/TourProvider';
import { needsDecision } from '../lib/describe';
import { useTracked } from '../lib/store';
import { useBackgroundRefresh } from '../lib/sync';
import { TENANT_NAMES, useTenant } from '../lib/tenant';

export function HomePage() {
  const tenant = useTenant();
  const { start } = useTour();
  const all = useTracked();
  const items = useMemo(
    () => all.filter((i) => i.tenant === tenant && i.kind !== 'recon').sort((a, b) => b.createdAt - a.createdAt),
    [all, tenant],
  );
  useBackgroundRefresh(tenant, items);

  const waiting = items.filter((i) => needsDecision(i));
  const inProgress = items.filter((i) => !i.finished && !i.gone && !i.parked);
  const active = items.filter((i) => i.lastStatus === 'ACTIVE' && !i.gone);
  const recent = items.slice(0, 5);

  return (
    <div className="page">
      <div className="home-hero">
        <div>
          <div className="eyebrow eyebrow-muted">{TENANT_NAMES[tenant]}</div>
          <h1>What would you like to do?</h1>
          <p className="page-sub">Issue virtual cards, follow their progress live, and step in when a request needs a decision.</p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => start('main')}>
          ▶ Take the tour
        </button>
      </div>

      <div className="action-tiles">
        <Link to={`/${tenant}/new`} className="action-tile action-primary">
          <span className="action-icon" aria-hidden>
            +
          </span>
          <span className="action-title">Issue a card</span>
          <span className="action-text">Create a virtual card in a few clicks</span>
        </Link>
        <Link to={`/${tenant}/requests${waiting.length ? '?filter=action' : ''}`} className={`action-tile${waiting.length ? ' action-warn' : ''}`}>
          <span className="action-icon" aria-hidden>
            {waiting.length || '✓'}
          </span>
          <span className="action-title">{waiting.length ? `${waiting.length === 1 ? 'Request needs' : 'Requests need'} attention` : 'Nothing needs attention'}</span>
          <span className="action-text">
            {inProgress.length} in progress · {active.length} active
          </span>
        </Link>
        <Link to={`/${tenant}/reconciliation`} className="action-tile">
          <span className="action-icon" aria-hidden>
            ⇄
          </span>
          <span className="action-title">Reconcile cards</span>
          <span className="action-text">Check the processor and platform agree</span>
        </Link>
      </div>

      <div className="home-grid">
        <div className="home-main">
          <section className="card" data-tour="attention">
            <div className="card-head">
              <h2>Needs your attention</h2>
              {waiting.length > 0 && <span className="badge badge-warning">{waiting.length}</span>}
            </div>
            {waiting.length === 0 ? (
              <div className="soft-empty">
                <p>Nothing is waiting for you right now.</p>
                <p className="muted small">
                  Want to see how reviews work?{' '}
                  <Link to={`/${tenant}/new?scenario=review`}>Issue a card that needs review →</Link>
                </p>
              </div>
            ) : (
              <ul className="req-list">
                {waiting.map((i) => (
                  <RequestItem key={`${i.kind}:${i.id}`} item={i} />
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Recent requests</h2>
              {items.length > 0 && <Link to={`/${tenant}/requests`}>View all ({items.length}) →</Link>}
            </div>
            {recent.length === 0 ? (
              <div className="soft-empty">
                <p>You haven't created any requests yet.</p>
                <Link to={`/${tenant}/new`} className="btn btn-primary btn-sm">
                  Issue your first card
                </Link>
              </div>
            ) : (
              <ul className="req-list">
                {recent.map((i) => (
                  <RequestItem key={`${i.kind}:${i.id}`} item={i} />
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="home-side">
          <Checklist />
        </aside>
      </div>
    </div>
  );
}
