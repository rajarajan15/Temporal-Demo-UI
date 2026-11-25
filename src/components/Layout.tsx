import { useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { TENANTS, type Tenant } from '../api/types';
import { GuideDrawer } from '../guide/GuideDrawer';
import { TourProvider, useTour } from '../guide/TourProvider';
import { prefs, useTracked } from '../lib/store';
import { TENANT_NAMES, useTenant } from '../lib/tenant';
import { describeCallbacks, isSimActive, useSim, useSimPruning } from '../lib/simState';

export function Layout() {
  return (
    <TourProvider>
      <Shell />
      <GuideDrawer />
    </TourProvider>
  );
}

function Shell() {
  const tenant = useTenant();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { setGuideOpen, start, seen, active } = useTour();
  const items = useTracked();
  const waiting = items.filter((i) => i.tenant === tenant && i.kind === 'card' && i.parked && !i.finished && !i.gone).length;
  const section = pathname.split('/')[2] ?? '';
  const simState = useSim(tenant);
  useSimPruning(tenant, simState);
  const simItems = [
    ...Object.values(simState.rules).map((r) => r.title),
    ...(simState.callbacks.mode !== 'NORMAL' ? [describeCallbacks(simState.callbacks)] : []),
  ];

  useEffect(() => prefs.set('tenant', tenant), [tenant]);

  // First visit: start the tour from the home page.
  useEffect(() => {
    if (!active && section === '' && !seen('main')) {
      const t = setTimeout(() => start('main'), 600);
      return () => clearTimeout(t);
    }
  }, [active, section, seen, start]);

  function switchTenant(next: Tenant) {
    // Detail pages belong to one bank, so switching goes to the other bank's equivalent section.
    const keep = ['new', 'requests', 'reconciliation', 'demo'].includes(section) && !pathname.split('/')[3] ? `/${section}` : '';
    navigate(`/${next}${keep}`);
  }

  const link = ({ isActive }: { isActive: boolean }) => `nav-link${isActive ? ' active' : ''}`;

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <Link to={`/${tenant}`} className="brand">
            <span className="brand-mark" aria-hidden>
              ▣
            </span>
            <span className="brand-name">Card Issuance</span>
          </Link>

          <nav className="nav" aria-label="Main">
            <NavLink to={`/${tenant}`} end className={link}>
              Home
            </NavLink>
            <NavLink to={`/${tenant}/requests`} className={link} data-tour="nav-requests">
              Requests
              {waiting > 0 && (
                <span className="nav-count" title={`${waiting} waiting for a decision`}>
                  {waiting}
                </span>
              )}
            </NavLink>
            <NavLink to={`/${tenant}/reconciliation`} className={link} data-tour="nav-recon">
              Reconciliation
            </NavLink>
            <NavLink to={`/${tenant}/demo`} className={link} data-tour="nav-sim">
              Simulator
            </NavLink>
          </nav>

          <div className="topbar-right">
            <label className="tenant-switch" data-tour="bank">
              <span className="tenant-label">Bank</span>
              <select value={tenant} onChange={(e) => switchTenant(e.target.value as Tenant)} aria-label="Bank">
                {TENANTS.map((t) => (
                  <option key={t} value={t}>
                    {TENANT_NAMES[t]}
                  </option>
                ))}
              </select>
            </label>
            <Link to={`/${tenant}/new`} className="btn btn-primary btn-sm" data-tour="new-card">
              + New card
            </Link>
            <button
              type="button"
              className="btn btn-ghost btn-sm help-btn"
              onClick={() => setGuideOpen(true)}
              data-tour="guide-button"
              aria-label="Open guide"
              title="Guide (?)"
            >
              ? <span className="help-label">Guide</span>
            </button>
          </div>
        </div>
      </header>

      {isSimActive(simState) && section !== 'demo' && (
        <div className="sim-banner" role="status">
          <div className="sim-banner-inner">
            <span>
              <strong>Simulator on for {TENANT_NAMES[tenant]}:</strong> {simItems.join(' · ')}. New cards may not behave normally.
            </span>
            <Link to={`/${tenant}/demo`} className="btn btn-ghost btn-xs">
              Manage
            </Link>
          </div>
        </div>
      )}

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
