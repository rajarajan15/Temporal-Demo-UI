import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { isSafeRef } from '../api/client';
import { RequestItem } from '../components/RequestItem';
import { Empty, Spinner } from '../components/ui';
import { needsDecision } from '../lib/describe';
import { tracked, useTracked, type TrackedItem } from '../lib/store';
import { refreshItems, useBackgroundRefresh } from '../lib/sync';
import { parkedSearchUrl } from '../lib/temporal';
import { useTenant } from '../lib/tenant';

type Filter = 'all' | 'action' | 'progress' | 'finished';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'action', label: 'Needs decision' },
  { id: 'progress', label: 'In progress' },
  { id: 'finished', label: 'Finished' },
];

function matches(i: TrackedItem, f: Filter) {
  switch (f) {
    case 'action':
      return needsDecision(i);
    case 'progress':
      return !i.finished && !i.gone;
    case 'finished':
      return !!i.finished || !!i.gone;
    default:
      return true;
  }
}

export function RequestsPage() {
  const tenant = useTenant();
  const navigate = useNavigate();
  const all = useTracked();
  const [params, setParams] = useSearchParams();
  const filter = (FILTERS.some((f) => f.id === params.get('filter')) ? params.get('filter') : 'all') as Filter;
  const setFilter = (f: Filter) => setParams(f === 'all' ? {} : { filter: f }, { replace: true });
  const [refreshing, setRefreshing] = useState(false);
  const [lookup, setLookup] = useState('');
  const [lookupOpen, setLookupOpen] = useState(false);
  const [lookupKind, setLookupKind] = useState<'card' | 'reissue'>('card');

  const items = useMemo(
    () => all.filter((i) => i.tenant === tenant && i.kind !== 'recon').sort((a, b) => b.createdAt - a.createdAt),
    [all, tenant],
  );
  useBackgroundRefresh(tenant, items);
  const shown = items.filter((i) => matches(i, filter));
  const counts = Object.fromEntries(FILTERS.map((f) => [f.id, items.filter((i) => matches(i, f.id)).length]));

  async function refreshAll() {
    setRefreshing(true);
    await refreshItems(items.filter((i) => !i.gone));
    setRefreshing(false);
  }

  function open(e: React.FormEvent) {
    e.preventDefault();
    const id = lookup.trim();
    if (!isSafeRef(id)) return;
    navigate(`/${tenant}/${lookupKind === 'card' ? 'requests' : 'reissues'}/${encodeURIComponent(id)}`);
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Requests</h1>
          <p className="page-sub">Card requests and reissues created in this browser. Statuses update automatically.</p>
        </div>
        <div className="btn-row">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLookupOpen((o) => !o)}>
            Open by ID
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void refreshAll()} disabled={refreshing || !items.length}>
            {refreshing && <Spinner />} Refresh
          </button>
        </div>
      </div>

      {lookupOpen && (
        <form className="card lookup" onSubmit={open}>
          <div className="lookup-row">
            <select value={lookupKind} onChange={(e) => setLookupKind(e.target.value as 'card' | 'reissue')} aria-label="Type">
              <option value="card">Card request</option>
              <option value="reissue">Reissue</option>
            </select>
            <input
              autoFocus
              placeholder="Paste a request ID"
              value={lookup}
              onChange={(e) => setLookup(e.target.value)}
              aria-label="Request ID"
            />
            <button className="btn btn-primary" disabled={!isSafeRef(lookup.trim())}>
              Open
            </button>
          </div>
          <p className="muted small">Use this to open a request created somewhere else, e.g. by a colleague or with Postman.</p>
        </form>
      )}

      <div className="tabs" role="tablist">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            role="tab"
            aria-selected={filter === f.id}
            className={`tab${filter === f.id ? ' active' : ''}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
            <span className={`tab-count${f.id === 'action' && counts[f.id] ? ' tab-count-warn' : ''}`}>{counts[f.id]}</span>
          </button>
        ))}
      </div>

      <div className="card card-flush">
        {shown.length === 0 ? (
          items.length === 0 ? (
            <Empty title="No requests yet">
              <Link to={`/${tenant}/new`} className="btn btn-primary btn-sm">
                Issue your first card
              </Link>
            </Empty>
          ) : (
            <Empty title={filter === 'action' ? 'Nothing needs a decision' : 'Nothing here'}>
              {filter === 'action' ? (
                <>
                  Only requests from this browser are listed.{' '}
                  <a href={parkedSearchUrl(tenant)} target="_blank" rel="noreferrer">
                    Search all waiting requests in Temporal ↗
                  </a>
                </>
              ) : (
                'No requests match this filter.'
              )}
            </Empty>
          )
        ) : (
          <ul className="req-list">
            {shown.map((i) => (
              <RequestItem key={`${i.kind}:${i.id}`} item={i} onForget={() => tracked.remove(i.tenant, i.kind, i.id)} />
            ))}
          </ul>
        )}
      </div>

      {items.length > 0 && (
        <div className="footnote">
          <span>Finished requests are removed by the backend after 24 hours and then show as Expired.</span>
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={() => {
              if (confirm(`Remove all ${items.length} requests from this list? The requests themselves aren't affected.`)) {
                tracked.clear(tenant, 'card');
                tracked.clear(tenant, 'reissue');
              }
            }}
          >
            Clear list
          </button>
        </div>
      )}
    </div>
  );
}
