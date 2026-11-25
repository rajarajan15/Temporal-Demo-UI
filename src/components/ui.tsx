import { useState, type ReactNode } from 'react';
import { ApiError } from '../api/client';
import { errorMessage, STATUS_LABELS, statusTone, type Tone } from '../lib/labels';
import type { CardStatus } from '../api/types';

export function Badge({ tone = 'neutral', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span className={`badge badge-${tone}`} title={title}>
      {children}
    </span>
  );
}

export function StatusBadge({
  status,
  finished,
  gone,
}: {
  status?: CardStatus | string;
  finished?: boolean;
  gone?: boolean;
}) {
  if (gone) return <Badge tone="neutral">Expired</Badge>;
  if (!status) return <Badge tone="neutral">Unknown</Badge>;
  const label = STATUS_LABELS[status as CardStatus] ?? status.charAt(0) + status.slice(1).toLowerCase();
  const tone = statusTone(status, finished);
  return (
    <Badge tone={tone}>
      {tone === 'info' && !finished && <span className="pulse" aria-hidden />}
      {label}
    </Badge>
  );
}

export function Callout({
  tone = 'info',
  title,
  children,
  actions,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className={`callout callout-${tone}`} role={tone === 'danger' ? 'alert' : undefined}>
      <div className="callout-body">
        {title && <div className="callout-title">{title}</div>}
        {children && <div className="callout-text">{children}</div>}
      </div>
      {actions && <div className="callout-actions">{actions}</div>}
    </div>
  );
}

export function ErrorCallout({ error, title, actions }: { error: unknown; title?: string; actions?: ReactNode }) {
  const code = error instanceof ApiError ? error.code : 'UNEXPECTED';
  const status = error instanceof ApiError && error.status ? ` (${error.status})` : '';
  return (
    <Callout tone="danger" title={title ?? errorMessage(code)} actions={actions}>
      <code>{code}</code>
      {status}
    </Callout>
  );
}

export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-ghost btn-xs"
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        });
      }}
      aria-label={`${label} ${value}`}
    >
      {done ? 'Copied' : label}
    </button>
  );
}

export function IdText({ value, copy = true }: { value: string; copy?: boolean }) {
  return (
    <span className="id-text">
      <code>{value}</code>
      {copy && <CopyButton value={value} />}
    </span>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className={`field${error ? ' field-error' : ''}`}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <div className="field-msg">{error}</div> : hint ? <div className="field-hint">{hint}</div> : null}
    </div>
  );
}

export function Spinner() {
  return <span className="spinner" aria-label="Loading" />;
}

export function LiveIndicator({ polling, transient }: { polling: boolean; transient: boolean }) {
  if (transient) return <Badge tone="warning">Reconnecting…</Badge>;
  if (polling)
    return (
      <span className="live">
        <span className="pulse" aria-hidden /> Live
      </span>
    );
  return null;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-title">{title}</div>
      {children && <div className="empty-text">{children}</div>}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  ...rest
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  'data-tour'?: string;
}) {
  return (
    <label className="switch" data-tour={rest['data-tour']}>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch-track" aria-hidden>
        <span className="switch-thumb" />
      </span>
      <span className="switch-label">{label}</span>
    </label>
  );
}
