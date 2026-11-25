import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import type { DiscrepancyType, ReconResult } from '../api/types';
import { Badge, Callout, ErrorCallout, IdText, LiveIndicator, Spinner } from '../components/ui';
import { errorMessage, type Tone } from '../lib/labels';
import { tracked } from '../lib/store';
import { workflowUrl } from '../lib/temporal';
import { useTenant } from '../lib/tenant';
import { usePoll } from '../lib/usePoll';

const TYPE_META: Record<DiscrepancyType, { label: string; help: string; tone: Tone }> = {
  UNKNOWN_TO_PLATFORM: { label: 'Unknown to platform', help: 'The processor has a card the platform never issued.', tone: 'danger' },
  MISSING_AT_PROCESSOR: { label: 'Missing at processor', help: 'The platform has a card the processor doesn\'t.', tone: 'danger' },
  STATUS_MISMATCH: { label: 'Status mismatch', help: 'Both have the card, with different statuses.', tone: 'warning' },
};

export function ReconRunPage() {
  const tenant = useTenant();
  const runId = decodeURIComponent(useParams().runId ?? '');
  const [typeFilter, setTypeFilter] = useState<DiscrepancyType | 'ALL'>('ALL');

  const { data, error, transient, polling, refresh } = usePoll<ReconResult>({
    key: `${tenant}:recon:${runId}`,
    fetcher: (signal) => api.getRecon(tenant, runId, signal).then((r) => r.data),
    isDone: (r) => r.status !== 'RUNNING',
    onData: (r) => {
      const patch = { lastStatus: r.status, finished: r.status !== 'RUNNING', discrepancyCount: r.report?.discrepancyCount, gone: false };
      if (tracked.get(tenant, 'recon', runId)) tracked.patch(tenant, 'recon', runId, patch);
      else tracked.upsert({ id: runId, tenant, kind: 'recon', ...patch });
    },
    onError: (e) => {
      if (e.status === 404) tracked.patch(tenant, 'recon', runId, { gone: true });
    },
  });

  const report = data?.report;
  const rows = report?.discrepancies.filter((d) => typeFilter === 'ALL' || d.type === typeFilter) ?? [];
  const byType = (t: DiscrepancyType) => report?.discrepancies.filter((d) => d.type === t).length ?? 0;

  return (
    <div className="page">
      <div className="breadcrumbs">
        <Link to={`/${tenant}/reconciliation`}>Reconciliation</Link> <span aria-hidden>/</span> <span>Run</span>
      </div>

      <div className="page-head">
        <div className="detail-title">
          <h1>
            Reconciliation run{' '}
            {data && (
              <Badge tone={data.status === 'COMPLETED' ? 'success' : data.status === 'FAILED' ? 'danger' : 'info'}>
                {data.status.toLowerCase()}
              </Badge>
            )}
          </h1>
          <IdText value={runId} />
        </div>
        <div className="head-side">
          {data && <LiveIndicator polling={polling} transient={!!transient} />}
          <a className="btn btn-ghost btn-sm" href={workflowUrl('recon', tenant, runId)} target="_blank" rel="noreferrer">
            Temporal ↗
          </a>
        </div>
      </div>

      {transient && <Callout tone="warning" title={errorMessage(transient.code)}>Asking again shortly.</Callout>}
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

      {(!data || data.status === 'RUNNING') && !error && (
        <div className="card loading-card">
          <Spinner /> Reconciling processor and platform cards…
        </div>
      )}

      {data?.status === 'FAILED' && <Callout tone="danger" title="The run failed">See the workflow in Temporal for details.</Callout>}

      {report && (
        <>
          <div className="stats">
            <Stat label="Business date" value={report.businessDate} />
            <Stat label="Processor cards" value={report.processorCards} />
            <Stat label="Platform cards" value={report.platformCards} />
            <Stat label="Pages read" value={report.pagesRead} />
            <Stat label="Discrepancies" value={report.discrepancyCount} tone={report.discrepancyCount ? 'warning' : 'success'} />
          </div>

          {report.discrepancyCount === 0 ? (
            <Callout tone="success" title="All cards match">The processor and the platform agree.</Callout>
          ) : (
            <section className="card">
              <div className="card-head">
                <h2>Discrepancies</h2>
                <div className="tabs tabs-sm" role="tablist">
                  <button role="tab" aria-selected={typeFilter === 'ALL'} className={`tab${typeFilter === 'ALL' ? ' active' : ''}`} onClick={() => setTypeFilter('ALL')}>
                    All <span className="tab-count">{report.discrepancies.length}</span>
                  </button>
                  {(Object.keys(TYPE_META) as DiscrepancyType[]).map((t) =>
                    byType(t) ? (
                      <button key={t} role="tab" aria-selected={typeFilter === t} className={`tab${typeFilter === t ? ' active' : ''}`} onClick={() => setTypeFilter(t)}>
                        {TYPE_META[t].label} <span className="tab-count">{byType(t)}</span>
                      </button>
                    ) : null,
                  )}
                </div>
              </div>

              {report.discrepancyCount > report.discrepancies.length && (
                <Callout tone="info">
                  Showing the first {report.discrepancies.length} of {report.discrepancyCount} discrepancies.
                </Callout>
              )}

              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Card ID</th>
                      <th>Type</th>
                      <th>Processor status</th>
                      <th>Platform status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((d, i) => (
                      <tr key={`${d.cardId}-${i}`}>
                        <td>
                          <code>{d.cardId}</code>
                        </td>
                        <td>
                          <Badge tone={TYPE_META[d.type]?.tone ?? 'neutral'} title={TYPE_META[d.type]?.help}>
                            {TYPE_META[d.type]?.label ?? d.type}
                          </Badge>
                        </td>
                        <td>{d.processorStatus ?? <span className="muted">—</span>}</td>
                        <td>{d.platformStatus ?? <span className="muted">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: Tone }) {
  return (
    <div className={`stat${tone ? ` stat-${tone}` : ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}
