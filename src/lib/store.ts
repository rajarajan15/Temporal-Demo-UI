import { useSyncExternalStore } from 'react';
import type { CardStatus, ReissueReason, Tenant } from '../api/types';

/**
 * The backend has no list endpoints (planned for Milestone 7), so the UI
 * remembers every key it creates in localStorage. This is that memory.
 */

export type TrackedKind = 'card' | 'reissue' | 'recon';

export interface CardInput {
  productCode: string;
  customerRef: string;
  accountRef: string;
  spendLimitMinor: number;
}

export interface TrackedItem {
  id: string;
  tenant: Tenant;
  kind: TrackedKind;
  createdAt: number;
  updatedAt: number;
  /** Last status seen by polling (card status, or recon run status). */
  lastStatus?: CardStatus | 'RUNNING' | 'COMPLETED' | 'FAILED';
  reasonCode?: string | null;
  finished?: boolean;
  parked?: boolean;
  /** 404 after the 24-hour retention period. */
  gone?: boolean;
  cardId?: string | null;
  input?: CardInput;
  // Reissue-specific
  oldCardId?: string;
  newCardRequestId?: string;
  reissueReason?: ReissueReason;
  /** Set on a card request that is the replacement of a reissue. */
  reissueId?: string;
  // Recon-specific
  discrepancyCount?: number;
}

const STORAGE_KEY = 'card-console.tracked.v1';

const itemKey = (i: Pick<TrackedItem, 'tenant' | 'kind' | 'id'>) => `${i.tenant}:${i.kind}:${i.id}`;

function load(): Record<string, TrackedItem> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, TrackedItem>) : {};
  } catch {
    return {};
  }
}

let items: Record<string, TrackedItem> = load();
let snapshot: TrackedItem[] = Object.values(items);
const listeners = new Set<() => void>();

function commit() {
  snapshot = Object.values(items);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* storage may be unavailable; memory still works for this session */
  }
  listeners.forEach((l) => l());
}

// Keep tabs in sync.
if (typeof window !== 'undefined')
  window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEY) {
    items = load();
    snapshot = Object.values(items);
    listeners.forEach((l) => l());
  }
});

export const tracked = {
  get(tenant: Tenant, kind: TrackedKind, id: string): TrackedItem | undefined {
    return items[itemKey({ tenant, kind, id })];
  },

  /** Insert or merge. `createdAt` is kept from the first insert. */
  upsert(item: Omit<TrackedItem, 'createdAt' | 'updatedAt'> & Partial<Pick<TrackedItem, 'createdAt'>>) {
    const k = itemKey(item);
    const prev = items[k];
    const now = Date.now();
    items = {
      ...items,
      [k]: { ...prev, ...item, createdAt: prev?.createdAt ?? item.createdAt ?? now, updatedAt: now },
    };
    commit();
  },

  /** Merge into an existing item only; ignores unknown items. Skips no-op writes. */
  patch(tenant: Tenant, kind: TrackedKind, id: string, patch: Partial<TrackedItem>) {
    const k = itemKey({ tenant, kind, id });
    const prev = items[k];
    if (!prev) return;
    const changed = (Object.keys(patch) as (keyof TrackedItem)[]).some((f) => prev[f] !== patch[f]);
    if (!changed) return;
    items = { ...items, [k]: { ...prev, ...patch, updatedAt: Date.now() } };
    commit();
  },

  remove(tenant: Tenant, kind: TrackedKind, id: string) {
    const k = itemKey({ tenant, kind, id });
    if (!items[k]) return;
    const next = { ...items };
    delete next[k];
    items = next;
    commit();
  },

  clear(tenant: Tenant, kind?: TrackedKind) {
    items = Object.fromEntries(
      Object.entries(items).filter(([, v]) => !(v.tenant === tenant && (!kind || v.kind === kind))),
    );
    commit();
  },
};

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useTracked(): TrackedItem[] {
  return useSyncExternalStore(subscribe, () => snapshot);
}

export function useTrackedItem(tenant: Tenant, kind: TrackedKind, id: string): TrackedItem | undefined {
  const all = useTracked();
  return all.find((i) => i.tenant === tenant && i.kind === kind && i.id === id);
}

/** Small per-browser preferences. */
export const prefs = {
  get(key: string, fallback: string): string {
    try {
      return localStorage.getItem(`card-console.pref.${key}`) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(`card-console.pref.${key}`, value);
    } catch {
      /* ignore */
    }
  },
};
