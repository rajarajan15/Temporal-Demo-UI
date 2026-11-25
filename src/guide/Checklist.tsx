import { useState } from 'react';
import { Link } from 'react-router-dom';
import { prefs, useTracked } from '../lib/store';
import { useTenant } from '../lib/tenant';

/** Flags for tasks that leave no trace in tracked requests. */
export const markDone = (task: 'review' | 'simulate') => prefs.set(`did.${task}`, '1');

interface Task {
  id: string;
  title: string;
  text: string;
  done: boolean;
  to: string;
  cta: string;
}

export function useChecklist(): Task[] {
  const tenant = useTenant();
  const items = useTracked();
  const activeCard = items.find((i) => i.tenant === tenant && i.kind === 'card' && i.lastStatus === 'ACTIVE' && !i.gone);

  return [
    {
      id: 'issue',
      title: 'Issue a card',
      text: 'Create a virtual card and watch it go live in about a second.',
      done: items.some((i) => i.kind === 'card' && i.lastStatus === 'ACTIVE'),
      to: `/${tenant}/new?scenario=approved`,
      cta: 'Issue a card',
    },
    {
      id: 'review',
      title: 'Make a review decision',
      text: 'Issue a card that needs an identity review, then approve or reject it.',
      done: prefs.get('did.review', '') === '1',
      to: `/${tenant}/new?scenario=review`,
      cta: 'Try a review',
    },
    {
      id: 'reissue',
      title: 'Reissue a card',
      text: 'Replace an active card as if it were lost or stolen.',
      done: items.some((i) => i.kind === 'reissue'),
      to: activeCard ? `/${tenant}/requests/${encodeURIComponent(activeCard.id)}#reissue` : `/${tenant}/new?scenario=approved`,
      cta: activeCard ? 'Open an active card' : 'Issue a card first',
    },
    {
      id: 'recon',
      title: 'Run a reconciliation',
      text: 'Compare the processor\'s cards with the platform\'s.',
      done: items.some((i) => i.kind === 'recon'),
      to: `/${tenant}/reconciliation`,
      cta: 'Reconcile',
    },
    {
      id: 'simulate',
      title: 'Simulate a failure',
      text: 'Make the processor misbehave and see how a request recovers.',
      done: prefs.get('did.simulate', '') === '1',
      to: `/${tenant}/demo`,
      cta: 'Open simulator',
    },
  ];
}

export function Checklist({ compact = false, onNavigate }: { compact?: boolean; onNavigate?: () => void }) {
  const tasks = useChecklist();
  const [hidden, setHidden] = useState(() => prefs.get('checklist.hidden', '') === '1');
  const done = tasks.filter((t) => t.done).length;
  const next = tasks.find((t) => !t.done);

  if (hidden && !compact) return null;

  return (
    <section className={`checklist${compact ? ' checklist-compact' : ' card'}`} data-tour={compact ? undefined : 'checklist'}>
      <div className="card-head">
        <div>
          <h2>Getting started</h2>
          <div className="muted small">
            {done === tasks.length ? 'All done. You know your way around!' : `${done} of ${tasks.length} done`}
          </div>
        </div>
        {!compact && (
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={() => {
              prefs.set('checklist.hidden', '1');
              setHidden(true);
            }}
          >
            Hide
          </button>
        )}
      </div>
      <div className="checklist-bar" aria-hidden>
        <div style={{ width: `${(done / tasks.length) * 100}%` }} />
      </div>
      <ol className="checklist-list">
        {tasks.map((t) => (
          <li key={t.id} className={`${t.done ? 'is-done' : ''}${t === next ? ' is-next' : ''}`}>
            <span className="check" aria-label={t.done ? 'Done' : 'Not done'}>
              {t.done ? '✓' : ''}
            </span>
            <div className="checklist-text">
              <div className="checklist-title">{t.title}</div>
              {!compact && <div className="muted small">{t.text}</div>}
            </div>
            {!t.done && (
              <Link to={t.to} className={`btn btn-sm ${t === next ? 'btn-primary' : 'btn-ghost'}`} onClick={onNavigate}>
                {t.cta}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
