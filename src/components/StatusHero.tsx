import type { ReactNode } from 'react';
import type { Description } from '../lib/describe';

export function StatusHero({ desc, children, live }: { desc: Description; children?: ReactNode; live?: boolean }) {
  return (
    <section className={`hero hero-${desc.tone}`} data-tour="status-hero" aria-live="polite">
      <div className="hero-icon" aria-hidden>
        {live && desc.tone === 'info' ? <span className="spinner" /> : desc.icon}
      </div>
      <div className="hero-body">
        <h2 className="hero-title">{desc.title}</h2>
        {desc.text && <p className="hero-text">{desc.text}</p>}
        {children && <div className="hero-actions">{children}</div>}
      </div>
    </section>
  );
}
