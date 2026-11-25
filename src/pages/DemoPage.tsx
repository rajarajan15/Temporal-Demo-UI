import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { Badge, Callout, Empty, Field, Spinner } from '../components/ui';
import { formatMinor, formatTime } from '../lib/format';
import { errorMessage, type Tone } from '../lib/labels';
import { useTenant } from '../lib/tenant';
import { Link } from 'react-router-dom';
import { markDone } from '../guide/Checklist';
import { describeCallbacks, isSimActive, remainingCalls, sim, useSim, useSimPruning, type Counters } from '../lib/simState';

/** Mock admin (development only). Shapes from mock-services in the backend repo and its README. */

const MOCKS: Record<string, string[]> = {
  kyc: ['check'],
  processor: [
    'createCard',
    'setLimits',
    'activateCard',
    'cancelCard',
    'resetLimits',
    'deactivateCard',
    'blockCard',
    'linkReplacement',
    'listCards',
  ],
  notification: ['send'],
};

const MODES = ['OFFLINE', 'SERVER_ERROR', 'BUSINESS_ERROR', 'LATENCY', 'DROP_RESPONSE'] as const;
type Mode = (typeof MODES)[number];

const MODE_HELP: Record<Mode, string> = {
  OFFLINE: '503 without doing the work',
  SERVER_ERROR: '500 without doing the work',
  BUSINESS_ERROR: '422 with a business code',
  LATENCY: 'Delays, then does the work',
  DROP_RESPONSE: 'Does the work, then never answers',
};

interface Scenario {
  title: string;
  expect: string;
  mock: string;
  op: string;
  rule: Record<string, unknown>;
  tone: Tone;
}

const SCENARIOS: Scenario[] = [
  { title: 'Fails twice, then recovers', expect: 'Retries quietly; the card still ends up active', mock: 'processor', op: 'createCard', rule: { mode: 'SERVER_ERROR', times: 2 }, tone: 'success' },
  { title: 'Response lost after success', expect: 'Card ends up active, with no duplicate created', mock: 'processor', op: 'createCard', rule: { mode: 'DROP_RESPONSE', times: 1 }, tone: 'success' },
  { title: 'Slow processor', expect: 'Card ends up active, just slower', mock: 'processor', op: 'createCard', rule: { mode: 'LATENCY', times: 1, latencyMs: 2000 }, tone: 'success' },
  { title: 'Notification down', expect: 'Card is active; only the customer notification fails', mock: 'notification', op: 'send', rule: { mode: 'OFFLINE', times: -1 }, tone: 'success' },
  { title: 'Activation declined', expect: 'Rejected, and the steps already done are undone', mock: 'processor', op: 'activateCard', rule: { mode: 'BUSINESS_ERROR', times: -1, code: 'ACTIVATION_DECLINED' }, tone: 'danger' },
  { title: 'Processor offline', expect: 'After about 30 s, waits for you to retry or cancel', mock: 'processor', op: 'createCard', rule: { mode: 'OFFLINE', times: -1 }, tone: 'warning' },
];

const CALLBACKS: { mode: string; label: string; help: string }[] = [
  { mode: 'NORMAL', label: 'Normal', help: 'Sent after 200 ms (default)' },
  { mode: 'DELAY', label: 'Delay', help: 'Sent late, after the 10 s confirmation timer' },
  { mode: 'DUPLICATE', label: 'Duplicate', help: 'Sent twice with the same event ID' },
  { mode: 'NEVER', label: 'Never', help: 'Never sent: parks with CONFIRMATION_TIMEOUT' },
];

interface ProcessorCard {
  cardId: string;
  status: string;
  limitMinor: number;
  productCode: string;
  replacedBy: string | null;
}

interface LogEntry {
  at: number;
  text: string;
  ok: boolean;
}

export function DemoPage() {
  const tenant = useTenant();
  const [log, setLog] = useState<LogEntry[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const push = (text: string, ok: boolean) => setLog((l) => [{ at: Date.now(), text, ok }, ...l].slice(0, 30));

  async function run(id: string, label: string, fn: () => Promise<unknown>) {
    setBusy(id);
    try {
      await fn();
      push(label, true);
      return true;
    } catch (e) {
      const code = e instanceof ApiError ? e.code : 'UNEXPECTED';
      push(`${label} — failed: ${errorMessage(code)}`, false);
      return false;
    } finally {
      setBusy(null);
    }
  }

  const simState = useSim(tenant);
  const [applied, setApplied] = useState<string | null>(null);
  const setRule = (mock: string, op: string, rule: Record<string, unknown>, title?: string) => {
    const name = title ?? `Custom rule on ${mock}/${op}`;
    return run(`${mock}/${op}`, `${name} switched on`, () => sim.setRule(tenant, mock, op, rule, name)).then((ok) => {
      if (ok) {
        markDone('simulate');
        setApplied(name);
      }
    });
  };

  // Custom rule builder
  const [mock, setMock] = useState('processor');
  const [op, setOp] = useState('createCard');
  const [mode, setMode] = useState<Mode>('SERVER_ERROR');
  const [times, setTimes] = useState('1');
  const [latencyMs, setLatencyMs] = useState('2000');
  const [code, setCode] = useState('ACTIVATION_DECLINED');

  function customRule(): Record<string, unknown> {
    const rule: Record<string, unknown> = { mode, times: Number(times) };
    if (mode === 'LATENCY') rule.latencyMs = Number(latencyMs);
    if (mode === 'BUSINESS_ERROR') rule.code = code;
    return rule;
  }
  const timesOk = /^-?\d+$/.test(times) && (Number(times) >= 1 || Number(times) === -1);

  // Callbacks
  const [delayMs, setDelayMs] = useState('15000');

  // Processor cards and counters
  const [cards, setCards] = useState<ProcessorCard[] | null>(null);
  const [counters, setCounters] = useState<Counters | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      const [c, n] = await Promise.all([
        api.mockAdmin('GET', `/cards/${tenant}`),
        api.mockAdmin('GET', `/counters/${tenant}`),
      ]);
      setCards(c.data as ProcessorCard[]);
      setCounters(n.data as Counters);
    } catch (e) {
      setLoadErr(e instanceof ApiError ? e.code : 'UNEXPECTED');
    } finally {
      setLoading(false);
    }
  }, [tenant]);

  useEffect(() => {
    void load();
  }, [load]);
  useSimPruning(tenant, simState, setCounters);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>
            Simulator <Badge tone="warning">test environment</Badge>
          </h1>
          <p className="page-sub">
            Make the test services misbehave, then issue a card to see how the system copes.
          </p>
          <ol className="how-steps">
            <li>Pick a scenario below</li>
            <li>Issue a new card</li>
            <li>Watch it on the request page</li>
            <li>Reset when you're done</li>
          </ol>
        </div>
        <button
          type="button"
          className="btn btn-danger-ghost"
          disabled={!!busy}
          onClick={() => {
            if (confirm("Reset the simulator for both banks? This switches off every scenario and clears the processor's test cards and counters."))
              void run('reset', 'Simulator reset', () => sim.resetAll()).then(() => {
                setApplied(null);
                void load();
              });
          }}
        >
          Reset everything
        </button>
      </div>

      <div className="demo-grid">
        <div className="demo-main">
          {applied && (
            <Callout
              tone="success"
              title={`"${applied}" is on`}
              actions={
                <Link to={`/${tenant}/new?scenario=approved`} className="btn btn-primary btn-sm">
                  Issue a card now →
                </Link>
              }
            >
              It affects the next card you issue for this bank.
            </Callout>
          )}
          <section className="card" data-tour="sim-active">
            <div className="card-head">
              <h2>Currently on for this bank</h2>
              {!isSimActive(simState) && <Badge tone="success">Everything normal</Badge>}
            </div>
            {!isSimActive(simState) ? (
              <p className="muted small">No scenarios are on. Cards for this bank behave normally.</p>
            ) : (
              <ul className="active-rules">
                {Object.entries(simState.rules).map(([k, r]) => {
                  const left = remainingCalls(r, counters);
                  return (
                    <li key={k}>
                      <div>
                        <strong>{r.title}</strong>
                        <div className="muted small">
                          {r.times < 0 ? 'Every call, until switched off' : left === null ? `Next ${r.times} call(s)` : `${left} more call(s), then off`} ·{' '}
                          <code>{k}</code>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={!!busy}
                        onClick={() => void run(`off-${k}`, `${r.title} switched off`, () => sim.clearRule(tenant, r.mock, r.op))}
                      >
                        Switch off
                      </button>
                    </li>
                  );
                })}
                {simState.callbacks.mode !== 'NORMAL' && (
                  <li>
                    <div>
                      <strong>{describeCallbacks(simState.callbacks)}</strong>
                      <div className="muted small">Processor confirmation callbacks</div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={!!busy}
                      onClick={() => void run('cb-normal', 'Callbacks back to normal', () => sim.setCallbacks(tenant, 'NORMAL'))}
                    >
                      Switch off
                    </button>
                  </li>
                )}
              </ul>
            )}
            <p className="muted small">
              Remembered by this browser. Changes made elsewhere (e.g. with curl) aren't shown; use Reset everything to be sure.
            </p>
          </section>

          <section className="card">
            <h2>Scenarios</h2>
            <p className="muted small">
              One click switches a scenario on. Ones that affect a fixed number of calls switch off by themselves; the rest
              stay on until you reset.
            </p>
            <div className="scenario-grid">
              {SCENARIOS.map((s) => (
                <button
                  key={s.title}
                  type="button"
                  className={`scenario scenario-${s.tone}${simState.rules[`${s.mock}/${s.op}`]?.title === s.title ? ' scenario-on' : ''}`}
                  disabled={!!busy}
                  onClick={() => void setRule(s.mock, s.op, s.rule, s.title)}
                >
                  <span className="scenario-title">
                    {s.title}
                    {simState.rules[`${s.mock}/${s.op}`]?.title === s.title && <Badge tone="warning">On</Badge>}
                  </span>
                  <span className="scenario-expect">{s.expect}</span>
                </button>
              ))}
            </div>
            <p className="muted small">
              For identity-check outcomes (review or rejection), use the choices on the{' '}
              <Link to={`/${tenant}/new`}>New card</Link> page instead.
            </p>
          </section>

          <section className="card">
            <h2>Custom rule</h2>
            <p className="muted small">For anything the scenarios above don't cover.</p>
            <div className="form-grid form-grid-3">
              <Field label="Mock" htmlFor="mock">
                <select
                  id="mock"
                  value={mock}
                  onChange={(e) => {
                    setMock(e.target.value);
                    setOp(MOCKS[e.target.value][0]);
                  }}
                >
                  {Object.keys(MOCKS).map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </Field>
              <Field label="Operation" htmlFor="op">
                <select id="op" value={op} onChange={(e) => setOp(e.target.value)}>
                  {MOCKS[mock].map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </Field>
              <Field label="Mode" htmlFor="mode" hint={MODE_HELP[mode]}>
                <select id="mode" value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
                  {MODES.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </Field>
              <Field label="Times" htmlFor="times" hint="-1 means every call" error={timesOk ? null : 'A positive number, or -1.'}>
                <input id="times" value={times} onChange={(e) => setTimes(e.target.value)} inputMode="numeric" />
              </Field>
              {mode === 'LATENCY' && (
                <Field label="Latency (ms)" htmlFor="latency">
                  <input id="latency" value={latencyMs} onChange={(e) => setLatencyMs(e.target.value)} inputMode="numeric" />
                </Field>
              )}
              {mode === 'BUSINESS_ERROR' && (
                <Field label="Business code" htmlFor="code">
                  <input id="code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="mono" />
                </Field>
              )}
            </div>
            <div className="rule-preview">
              <code>
                PUT /mock-admin/failures/{tenant}/{mock}/{op} {JSON.stringify(customRule())}
              </code>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-fit"
              disabled={!!busy || !timesOk}
              onClick={() => void setRule(mock, op, customRule())}
            >
              {busy === `${mock}/${op}` && <Spinner />} Apply rule
            </button>
          </section>

          <section className="card">
            <h2>Confirmation callbacks</h2>
            <p className="muted small">How the processor sends card confirmations to the platform's webhook.</p>
            <div className="callback-grid">
              {CALLBACKS.map((c) => (
                <div key={c.mode} className="callback">
                  <button
                    type="button"
                    className={`btn ${simState.callbacks.mode === c.mode ? 'btn-primary' : 'btn-secondary'}`}
                    aria-pressed={simState.callbacks.mode === c.mode}
                    disabled={!!busy}
                    onClick={() => {
                      const d = c.mode === 'DELAY' ? Number(delayMs) : undefined;
                      void run(`cb-${c.mode}`, `Callbacks set to ${c.label.toLowerCase()}`, () => sim.setCallbacks(tenant, c.mode, d)).then(
                        (ok) => ok && c.mode !== 'NORMAL' && markDone('simulate'),
                      );
                    }}
                  >
                    {c.label}
                  </button>
                  <span className="muted small">{c.help}</span>
                  {c.mode === 'DELAY' && (
                    <input
                      aria-label="Delay in milliseconds"
                      className="input-sm"
                      value={delayMs}
                      onChange={(e) => setDelayMs(e.target.value)}
                      inputMode="numeric"
                    />
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Processor cards</h2>
              <div className="btn-row">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={!!busy}
                  title="Creates an active card the platform never issued. Reconciliation reports it as UNKNOWN_TO_PLATFORM."
                  onClick={() =>
                    void run('orphan', `Created orphan card for ${tenant}`, () => api.mockAdmin('POST', `/cards/${tenant}/orphan`)).then(
                      () => void load(),
                    )
                  }
                >
                  Create orphan card
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void load()} disabled={loading}>
                  {loading && <Spinner />} Refresh
                </button>
              </div>
            </div>
            {loadErr && (
              <Callout tone="danger" title={errorMessage(loadErr)}>
                Is the mock admin running on port 8091? <code>{loadErr}</code>
              </Callout>
            )}
            {cards && cards.length === 0 && <Empty title="No cards at the processor" />}
            {cards && cards.length > 0 && (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Card ID</th>
                      <th>Status</th>
                      <th>Product</th>
                      <th className="num">Limit</th>
                      <th>Replaced by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cards.map((c) => (
                      <tr key={c.cardId}>
                        <td>
                          <code>{c.cardId}</code>
                        </td>
                        <td>
                          <Badge tone={c.status === 'ACTIVE' ? 'success' : c.status === 'BLOCKED' || c.status === 'CANCELLED' ? 'danger' : 'neutral'}>
                            {c.status.toLowerCase()}
                          </Badge>
                        </td>
                        <td className="small">{c.productCode ?? '—'}</td>
                        <td className="num">{formatMinor(c.limitMinor ?? 0)}</td>
                        <td>{c.replacedBy ? <code>{c.replacedBy}</code> : <span className="muted">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <aside className="demo-side">
          <section className="card">
            <h2>Activity</h2>
            {log.length === 0 ? (
              <p className="muted small">Actions you take here show up in this list.</p>
            ) : (
              <ul className="log">
                {log.map((l, i) => (
                  <li key={i} className={l.ok ? 'log-ok' : 'log-fail'}>
                    <span className="log-time">{formatTime(l.at)}</span>
                    <span className="log-text">{l.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <h2>Call counters</h2>
            {!counters ? (
              <p className="muted small">—</p>
            ) : (
              <>
                <CounterTable title="Calls" data={counters.calls} />
                <CounterTable title="Side effects" data={counters.sideEffects} />
              </>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function CounterTable({ title, data }: { title: string; data?: Record<string, number> }) {
  const entries = Object.entries(data ?? {}).sort(([a], [b]) => a.localeCompare(b));
  return (
    <div className="counters">
      <div className="kv-label">{title}</div>
      {entries.length === 0 ? (
        <p className="muted small">None</p>
      ) : (
        <table className="table table-compact">
          <tbody>
            {entries.map(([k, v]) => (
              <tr key={k}>
                <td>
                  <code>{k}</code>
                </td>
                <td className="num">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
