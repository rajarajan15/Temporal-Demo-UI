import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { prefs } from '../lib/store';
import { useTenant } from '../lib/tenant';
import { TOURS, type TourId } from './tours';

interface TourApi {
  start: (id: TourId) => void;
  active: TourId | null;
  seen: (id: TourId) => boolean;
  guideOpen: boolean;
  setGuideOpen: (open: boolean) => void;
}

const TourContext = createContext<TourApi | null>(null);

export function useTour(): TourApi {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour must be used inside TourProvider');
  return ctx;
}

const seenKey = (id: TourId) => `tour.${id}.seen`;

export function TourProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<TourId | null>(null);
  const [index, setIndex] = useState(0);
  const [guideOpen, setGuideOpen] = useState(false);

  const start = useCallback((id: TourId) => {
    setGuideOpen(false);
    setIndex(0);
    setActive(id);
  }, []);

  const end = useCallback(() => {
    setActive((cur) => {
      if (cur) prefs.set(seenKey(cur), '1');
      return null;
    });
  }, []);

  const seen = useCallback((id: TourId) => prefs.get(seenKey(id), '') === '1', []);

  // "?" opens the guide from anywhere except text fields.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '?' && !active && !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) {
        e.preventDefault();
        setGuideOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);

  return (
    <TourContext.Provider value={{ start, active, seen, guideOpen, setGuideOpen }}>
      {children}
      {active && <TourOverlay id={active} index={index} setIndex={setIndex} onEnd={end} />}
    </TourContext.Provider>
  );
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 6;
const POP_W = 340;

function findTarget(name: string): HTMLElement | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`));
  // Prefer a visible match (some targets exist twice, e.g. desktop and mobile).
  return all.find((el) => el.offsetParent !== null || el.getClientRects().length > 0) ?? null;
}

function TourOverlay({
  id,
  index,
  setIndex,
  onEnd,
}: {
  id: TourId;
  index: number;
  setIndex: (i: number) => void;
  onEnd: () => void;
}) {
  const tenant = useTenant();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const steps = TOURS[id].steps;
  const step = steps[index];
  const [rect, setRect] = useState<Rect | null>(null);
  const [ready, setReady] = useState(false);
  const dir = useRef<1 | -1>(1);
  const popRef = useRef<HTMLDivElement>(null);

  // Go to the step's page, then wait for its target to render.
  useEffect(() => {
    if (!step) return;
    setReady(false);
    setRect(null);
    const route = step.route?.(tenant);
    if (route && route !== pathname) {
      navigate(route);
      return; // effect re-runs when pathname changes
    }
    if (!step.target) {
      setReady(true);
      return;
    }
    let tries = 0;
    let timer: number;
    const look = () => {
      const el = findTarget(step.target!);
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        // Measure after the scroll settles.
        timer = window.setTimeout(() => {
          const r = el.getBoundingClientRect();
          setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
          setReady(true);
        }, 350);
      } else if (tries++ < 20) {
        timer = window.setTimeout(look, 100);
      } else if (step.optional) {
        const next = index + dir.current;
        if (next < 0 || next >= steps.length) onEnd();
        else setIndex(next);
      } else {
        setReady(true); // show centred
      }
    };
    look();
    return () => window.clearTimeout(timer);
  }, [step, index, pathname, tenant, navigate, onEnd, setIndex, steps.length]);

  // Track the target while scrolling or resizing.
  useEffect(() => {
    if (!ready || !step?.target) return;
    const update = () => {
      const el = findTarget(step.target!);
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [ready, step]);

  const go = useCallback(
    (delta: 1 | -1) => {
      dir.current = delta;
      const next = index + delta;
      if (next >= steps.length) onEnd();
      else if (next >= 0) setIndex(next);
    },
    [index, steps.length, onEnd, setIndex],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEnd();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onEnd]);

  useLayoutEffect(() => {
    if (ready) popRef.current?.focus();
  }, [ready, index]);

  if (!step) return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const mobile = vw < 640;
  let popStyle: React.CSSProperties;
  if (!rect || mobile) {
    popStyle = mobile
      ? { left: 12, right: 12, bottom: 12 }
      : { left: Math.max(16, (vw - POP_W) / 2), top: Math.max(16, vh / 2 - 110) };
  } else {
    const below = rect.top + rect.height + PAD + 12;
    const spaceBelow = vh - below;
    const left = Math.min(Math.max(16, rect.left + rect.width / 2 - POP_W / 2), vw - POP_W - 16);
    popStyle =
      spaceBelow > 200
        ? { left, top: below }
        : rect.top > 220
          ? { left, bottom: vh - rect.top + PAD + 12 }
          : { left, top: Math.max(16, vh / 2 - 110) };
  }

  const last = index === steps.length - 1;

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {rect ? (
        <div
          className="tour-spot"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
          }}
        />
      ) : (
        <div className="tour-dim" />
      )}
      {ready && (
        <div className={`tour-pop${mobile ? ' tour-pop-sheet' : ''}`} style={popStyle} ref={popRef} tabIndex={-1}>
          <div className="tour-step">
            {TOURS[id].name} · {index + 1} of {steps.length}
          </div>
          <h3 id="tour-title">{step.title}</h3>
          <p>{step.body}</p>
          <div className="tour-dots" aria-hidden>
            {steps.map((_, i) => (
              <span key={i} className={i === index ? 'on' : i < index ? 'done' : ''} />
            ))}
          </div>
          <div className="tour-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onEnd}>
              {last ? 'Close' : 'Skip tour'}
            </button>
            <div className="btn-row">
              {index > 0 && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => go(-1)}>
                  Back
                </button>
              )}
              <button type="button" className="btn btn-primary btn-sm" onClick={() => go(1)}>
                {last ? 'Finish' : index === 0 ? 'Start' : 'Next'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
