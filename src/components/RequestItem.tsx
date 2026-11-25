import { Link } from 'react-router-dom';
import { describeItem, needsDecision } from '../lib/describe';
import { formatDateTime, formatMinor, timeAgo } from '../lib/format';
import type { TrackedItem } from '../lib/store';
import { StatusBadge } from './ui';

export const itemHref = (i: TrackedItem) =>
  `/${i.tenant}/${i.kind === 'reissue' ? 'reissues' : 'requests'}/${encodeURIComponent(i.id)}`;

export function itemTitle(i: TrackedItem): string {
  const product = i.input?.productCode === 'VIRTUAL_PREMIUM' ? 'Premium' : i.input?.productCode === 'VIRTUAL_STANDARD' ? 'Standard' : 'Virtual';
  if (i.kind === 'reissue') return `Reissue (${(i.reissueReason ?? '').toLowerCase()}) · ${i.input?.customerRef ?? 'card'}`;
  return `${product} card · ${i.input?.customerRef ?? i.id.slice(0, 8)}`;
}

/** A readable row: what it is, what's happening, and the one action that matters. */
export function RequestItem({ item: i, onForget }: { item: TrackedItem; onForget?: () => void }) {
  const decide = needsDecision(i) && !i.finished;
  return (
    <li className={`req-item${decide ? ' req-attention' : ''}`}>
      <Link to={itemHref(i)} className="req-main">
        <div className="req-title">
          {itemTitle(i)}
          {i.reissueId && <span className="req-tag">replacement</span>}
        </div>
        <div className="req-sub">
          {describeItem(i)}
          {i.input && <span className="muted"> · limit {formatMinor(i.input.spendLimitMinor)}</span>}
        </div>
      </Link>
      <div className="req-side">
        <StatusBadge status={i.lastStatus} finished={i.finished} gone={i.gone} />
        <span className="muted small" title={formatDateTime(i.createdAt)}>
          {timeAgo(i.createdAt)}
        </span>
        {decide || (needsDecision(i) && i.finished) ? (
          <Link to={itemHref(i)} className="btn btn-primary btn-sm">
            {decide ? 'Decide' : 'Open'}
          </Link>
        ) : onForget ? (
          <button type="button" className="btn btn-ghost btn-xs req-forget" onClick={onForget} title="Remove from this list">
            Remove
          </button>
        ) : null}
      </div>
    </li>
  );
}
