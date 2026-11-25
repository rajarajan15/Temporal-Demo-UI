import type { Step } from '../api/types';
import { formatDuration } from '../lib/format';
import { UNDO_STEPS } from '../lib/labels';

export function stepProgress(steps: Step[]) {
  const main = steps.filter((s) => !UNDO_STEPS.has(s.name));
  const done = main.filter((s) => s.state === 'DONE').length;
  const started = steps.map((s) => s.startedAtMillis).filter((n): n is number => !!n);
  const finished = steps.map((s) => s.finishedAtMillis).filter((n): n is number => !!n);
  const elapsed = started.length ? (finished.length ? Math.max(...finished) : Date.now()) - Math.min(...started) : null;
  return { done, total: main.length, elapsed, rolledBack: steps.some((s) => UNDO_STEPS.has(s.name)) };
}

export function ProgressBar({ steps, finished }: { steps: Step[]; finished: boolean }) {
  const { done, total, elapsed } = stepProgress(steps);
  if (!total) return null;
  const failed = steps.some((s) => s.state === 'FAILED');
  return (
    <div className="progress">
      <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
        <div
          className={`progress-fill${failed ? ' progress-fail' : ''}${finished ? '' : ' progress-live'}`}
          style={{ width: `${(done / total) * 100}%` }}
        />
      </div>
      <div className="progress-meta">
        <span>
          {done} of {total} steps
        </span>
        {elapsed !== null && finished && <span>total {formatDuration(elapsed)}</span>}
      </div>
    </div>
  );
}
