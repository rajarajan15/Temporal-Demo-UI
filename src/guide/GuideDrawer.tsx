import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { StatusBadge } from '../components/ui';
import { useTenant } from '../lib/tenant';
import { Checklist } from './Checklist';
import { useTour } from './TourProvider';

interface Topic {
  id: string;
  title: string;
  /** Route section this topic is most relevant to (opened by default there). */
  section: string;
  body: (tenant: string, close: () => void) => ReactNode;
}

const TOPICS: Topic[] = [
  {
    id: 'issue',
    title: 'Issue a card',
    section: 'new',
    body: (t, close) => (
      <>
        <ol>
          <li>
            Press <strong>New card</strong> in the top bar.
          </li>
          <li>
            Choose <strong>what should happen</strong>. <em>Approved</em> gives a normal active card.
          </li>
          <li>Keep the prefilled details or change them, then press <strong>Issue card</strong>.</li>
          <li>You land on the request page, which updates live until the card is active.</li>
        </ol>
        <p className="muted">
          Pressing Issue twice is safe: each form has its own request ID, so a retry never creates a second card.
        </p>
        <TryIt to={`/${t}/new?scenario=approved`} onClick={close}>
          Issue a card
        </TryIt>
      </>
    ),
  },
  {
    id: 'review',
    title: 'Handle a request that needs a decision',
    section: 'requests',
    body: (t, close) => (
      <>
        <p>A request pauses for an operator when:</p>
        <ul>
          <li>
            <strong>Identity review:</strong> the KYC check couldn't decide. Approve or reject.
          </li>
          <li>
            <strong>Confirmation timeout:</strong> the processor didn't confirm within 10 seconds. Approve or reject. A late
            confirmation clears this by itself.
          </li>
          <li>
            <strong>Retries exhausted:</strong> a step kept failing for about 30 seconds. Retry it, or cancel and undo.
          </li>
        </ul>
        <p>
          Waiting requests show on <strong>Home</strong> and under <strong>Requests → Needs decision</strong>. Open one and
          use the yellow panel at the top.
        </p>
        <TryIt to={`/${t}/new?scenario=review`} onClick={close}>
          Create a request that needs review
        </TryIt>
      </>
    ),
  },
  {
    id: 'cancel',
    title: 'Cancel a request',
    section: 'requests',
    body: () => (
      <>
        <p>
          Open the request and press <strong>Cancel request</strong> in the side panel. It's available until the card is
          active. Steps that already completed are undone automatically.
        </p>
        <p className="muted">Once a card is active it can't be cancelled. Reissue it instead.</p>
      </>
    ),
  },
  {
    id: 'reissue',
    title: 'Reissue a lost or stolen card',
    section: 'reissues',
    body: () => (
      <>
        <ol>
          <li>Open a request whose card is <strong>Active</strong>.</li>
          <li>
            Press <strong>Reissue card</strong>, choose a reason and confirm the details.
          </li>
          <li>For lost or stolen cards, the old card is blocked first. Then a replacement is issued and linked.</li>
        </ol>
        <p className="muted">The replacement is a normal card request, so it can also pause for review.</p>
      </>
    ),
  },
  {
    id: 'recon',
    title: 'Reconciliation',
    section: 'reconciliation',
    body: (t, close) => (
      <>
        <p>Compares the processor's card list with the platform's and reports three kinds of mismatch:</p>
        <ul>
          <li>
            <strong>Unknown to platform:</strong> the processor has a card the platform never issued.
          </li>
          <li>
            <strong>Missing at processor:</strong> the platform has a card the processor doesn't.
          </li>
          <li>
            <strong>Status mismatch:</strong> both have it, with different statuses.
          </li>
        </ul>
        <p className="muted">Tip: create an "orphan card" in the Simulator first to see a mismatch.</p>
        <TryIt to={`/${t}/reconciliation`} onClick={close}>
          Run a reconciliation
        </TryIt>
      </>
    ),
  },
  {
    id: 'simulate',
    title: 'Simulate failures',
    section: 'demo',
    body: (t, close) => (
      <>
        <ol>
          <li>
            Open the <strong>Simulator</strong> and pick a scenario, e.g. <em>Processor offline</em>.
          </li>
          <li>Issue a new card and watch the request page.</li>
          <li>
            Press <strong>Reset everything</strong> afterwards. Some scenarios stay on until you reset.
          </li>
        </ol>
        <TryIt to={`/${t}/demo`} onClick={close}>
          Open the simulator
        </TryIt>
      </>
    ),
  },
  {
    id: 'faq',
    title: 'Where did my request go?',
    section: '',
    body: () => (
      <>
        <p>
          The console remembers requests created <strong>in this browser</strong>. Requests made elsewhere can be opened by
          their ID on the Requests page.
        </p>
        <p>Finished requests are deleted by the backend after 24 hours and then show as <em>Expired</em>.</p>
      </>
    ),
  },
];

const GLOSSARY: { status: string; finished?: boolean; text: string }[] = [
  { status: 'REQUESTED', text: 'Received and being checked.' },
  { status: 'KYC_PASSED', text: 'The customer passed identity checks.' },
  { status: 'CREATED', text: 'The card exists at the processor but isn\'t usable yet.' },
  { status: 'UNDER_REVIEW', text: 'Paused until an operator decides.' },
  { status: 'ACTIVE', finished: true, text: 'Done: the card is ready to use.' },
  { status: 'REJECTED', finished: true, text: 'Refused by a check, the processor or an operator.' },
  { status: 'CANCELLED', finished: true, text: 'Stopped on request. Completed steps were undone.' },
];

function TryIt({ to, children, onClick }: { to: string; children: ReactNode; onClick: () => void }) {
  return (
    <Link to={to} className="btn btn-secondary btn-sm try-it" onClick={onClick}>
      {children} →
    </Link>
  );
}

export function GuideDrawer() {
  const { guideOpen, setGuideOpen, start } = useTour();
  const tenant = useTenant();
  const { pathname } = useLocation();
  const section = pathname.split('/')[2] ?? '';
  const onRequestPage = section === 'requests' && !!pathname.split('/')[3];
  const [open, setOpen] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const close = () => setGuideOpen(false);

  // Open the topic that matches the current page.
  useEffect(() => {
    if (guideOpen) {
      setOpen(TOPICS.find((t) => t.section === section)?.id ?? null);
      panelRef.current?.focus();
    }
  }, [guideOpen, section]);

  useEffect(() => {
    if (!guideOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setGuideOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [guideOpen, setGuideOpen]);

  if (!guideOpen) return null;

  return (
    <div className="drawer-wrap">
      <div className="drawer-scrim" onClick={close} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Guide" ref={panelRef} tabIndex={-1}>
        <div className="drawer-head">
          <h2>Guide</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={close} aria-label="Close guide">
            ✕
          </button>
        </div>

        <div className="drawer-body">
          <div className="tour-cards">
            <button type="button" className="tour-card" onClick={() => start('main')}>
              <span className="tour-card-icon" aria-hidden>
                ▶
              </span>
              <span>
                <strong>Take the tour</strong>
                <span className="muted small">A 1-minute walk through the console</span>
              </span>
            </button>
            {onRequestPage && (
              <button type="button" className="tour-card" onClick={() => start('request')}>
                <span className="tour-card-icon" aria-hidden>
                  ◎
                </span>
                <span>
                  <strong>Explain this page</strong>
                  <span className="muted small">What each part of a request shows</span>
                </span>
              </button>
            )}
          </div>

          <Checklist compact onNavigate={close} />

          <div>
            <h3 className="drawer-section">How to</h3>
            <div className="accordion">
              {TOPICS.map((t) => (
                <div key={t.id} className={`acc-item${open === t.id ? ' open' : ''}`}>
                  <button type="button" className="acc-head" aria-expanded={open === t.id} onClick={() => setOpen(open === t.id ? null : t.id)}>
                    {t.title}
                    <span className="acc-chev" aria-hidden>
                      ›
                    </span>
                  </button>
                  {open === t.id && <div className="acc-body">{t.body(tenant, close)}</div>}
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="drawer-section">What the statuses mean</h3>
            <dl className="glossary">
              {GLOSSARY.map((g) => (
                <div key={g.status}>
                  <dt>
                    <StatusBadge status={g.status} finished={g.finished ?? false} />
                  </dt>
                  <dd>{g.text}</dd>
                </div>
              ))}
            </dl>
          </div>

          <p className="muted small">
            Press <kbd>?</kbd> anywhere to open or close this guide.
          </p>
        </div>
      </aside>
    </div>
  );
}
