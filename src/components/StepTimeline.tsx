import { useEffect, useState } from 'react';
import type { Step, StepState } from '../api/types';
import { formatDuration, formatTime } from '../lib/format';
import { STEP_STATE_TONE, stepLabel, UNDO_STEPS } from '../lib/labels';
import { Badge } from './ui';

const ICONS: Record<string, string> = {
  DONE: '✓',
  FAILED: '✕',
  PARKED: '❚❚',
  WAITING: '…',
  RUNNING: '',
  PENDING: '',
  COMPENSATING: '↺',
  COMPENSATED: '↺',
};

const PLAIN_STATE: Record<StepState, string> = {
  PENDING: 'Not started',
  RUNNING: 'In progress',
  WAITING: 'Waiting for processor',
  PARKED: 'Waiting for decision',
  DONE: 'Done',
  FAILED: 'Failed',
  COMPENSATING: 'Undoing',
  COMPENSATED: 'Undone',
};

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

export function StepTimeline({ steps, finished, technical = false }: { steps: Step[]; finished: boolean; technical?: boolean }) {
  const anyActive = !finished && steps.some((s) => s.startedAtMillis && !s.finishedAtMillis);
  const now = useNow(anyActive);

  if (steps.length === 0) {
    return (
      <p className="muted small">
        Step details aren't available right now (the worker may be restarting). The status above is still accurate.
      </p>
    );
  }

  const firstUndo = steps.findIndex((s) => UNDO_STEPS.has(s.name));

  return (
    <ol className={`timeline${technical ? '' : ' timeline-simple'}`}>
      {steps.map((raw, i) => {
        // A request that ended (cancelled, rejected) can leave an interrupted step in a live state.
        const stopped = finished && ['RUNNING', 'WAITING', 'PARKED', 'COMPENSATING'].includes(raw.state);
        const s = stopped ? { ...raw, finishedAtMillis: raw.finishedAtMillis ?? raw.startedAtMillis } : raw;
        const tone = stopped ? 'neutral' : (STEP_STATE_TONE[s.state] ?? 'neutral');
        const end = s.finishedAtMillis ?? (s.startedAtMillis ? now : null);
        const duration = s.startedAtMillis && end ? end - s.startedAtMillis : null;
        const showError = s.lastErrorCode && (technical || s.state === 'FAILED');
        return (
          <li key={`${s.name}-${i}`} className={`tl-item tl-${tone} tl-state-${stopped ? 'stopped' : s.state.toLowerCase()}`}>
            {i === firstUndo && <div className="tl-divider">Undoing completed steps</div>}
            <div className="tl-marker" aria-hidden>
              {stopped ? '–' : s.state === 'RUNNING' ? <span className="tl-spin" /> : ICONS[s.state]}
            </div>
            <div className="tl-content">
              <div className="tl-head">
                <span className="tl-name">{stepLabel(s.name)}</span>
                {stopped ? (
                  <Badge tone="neutral">Stopped</Badge>
                ) : (
                  s.state !== 'PENDING' && s.state !== 'DONE' && <Badge tone={tone}>{PLAIN_STATE[s.state]}</Badge>
                )}
                {!technical && s.state === 'DONE' && duration !== null && <span className="tl-dur">{formatDuration(duration)}</span>}
              </div>
              {technical && (
                <div className="tl-meta">
                  <code className="tl-code">{s.name}</code>
                  <span>{s.state}</span>
                  {s.startedAtMillis && <span>started {formatTime(s.startedAtMillis)}</span>}
                  {duration !== null && !stopped && (
                    <span>
                      {s.finishedAtMillis ? 'took' : 'running for'} {formatDuration(duration)}
                    </span>
                  )}
                </div>
              )}
              {showError && (
                <div className={s.state === 'FAILED' ? 'tl-error' : 'tl-note'}>
                  {s.state === 'FAILED' ? 'Error' : 'Last code'}: <code>{s.lastErrorCode}</code>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
