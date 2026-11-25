import { useEffect, useSyncExternalStore } from 'react';
import { api } from '../api/client';
import type { Tenant } from '../api/types';

/**
 * The mock admin can set failure rules and callback modes but can't read them back,
 * so the UI remembers what it switched on. Rules that affect a fixed number of calls
 * are pruned once the mock's call counters show they've been used up.
 */

export interface ActiveRule {
  mock: string;
  op: string;
  title: string;
  rule: Record<string, unknown>;
  /** -1 = every call. */
  times: number;
  /** calls[mock/op] when the rule was set, to work out how many calls remain. */
  baseCalls: number | null;
  at: number;
}

export interface SimTenantState {
  rules: Record<string, ActiveRule>;
  callbacks: { mode: string; delayMs?: number };
}

type SimState = Partial<Record<Tenant, SimTenantState>>;

const KEY = 'card-console.sim.v1';
const EMPTY: SimTenantState = { rules: {}, callbacks: { mode: 'NORMAL' } };

function load(): SimState {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as SimState;
  } catch {
    return {};
  }
}

let state: SimState = load();
const listeners = new Set<() => void>();

function commit(next: SimState) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

if (typeof window !== 'undefined')
  window.addEventListener('storage', (e) => {
  if (e.key === KEY) {
    state = load();
    listeners.forEach((l) => l());
  }
});

const get = (t: Tenant): SimTenantState => state[t] ?? EMPTY;
const ruleKey = (mock: string, op: string) => `${mock}/${op}`;

export type Counters = { calls?: Record<string, number>; sideEffects?: Record<string, number> };

export const sim = {
  async setRule(tenant: Tenant, mock: string, op: string, rule: Record<string, unknown>, title: string) {
    let baseCalls: number | null = null;
    try {
      const { data } = await api.mockAdmin('GET', `/counters/${tenant}`);
      baseCalls = (data as Counters).calls?.[ruleKey(mock, op)] ?? 0;
    } catch {
      /* counters are a nicety */
    }
    await api.mockAdmin('PUT', `/failures/${tenant}/${mock}/${op}`, rule);
    const cur = get(tenant);
    const times = typeof rule.times === 'number' ? rule.times : 1;
    commit({
      ...state,
      [tenant]: {
        ...cur,
        rules: { ...cur.rules, [ruleKey(mock, op)]: { mock, op, title, rule, times, baseCalls, at: Date.now() } },
      },
    });
  },

  /** `times: 0` makes the mock drop the rule on its next call; it never fails a call. */
  async clearRule(tenant: Tenant, mock: string, op: string) {
    await api.mockAdmin('PUT', `/failures/${tenant}/${mock}/${op}`, { mode: 'OFFLINE', times: 0 });
    forget(tenant, ruleKey(mock, op));
  },

  async setCallbacks(tenant: Tenant, mode: string, delayMs?: number) {
    await api.mockAdmin('PUT', `/callbacks/${tenant}`, delayMs ? { mode, delayMs } : { mode });
    commit({ ...state, [tenant]: { ...get(tenant), callbacks: delayMs ? { mode, delayMs } : { mode } } });
  },

  /** The mock reset is global: it clears every tenant. */
  async resetAll() {
    await api.mockAdmin('POST', '/reset');
    commit({});
  },

  /** Drops finite rules that the counters show have been used up. */
  prune(tenant: Tenant, counters: Counters) {
    const cur = get(tenant);
    const keep = Object.fromEntries(
      Object.entries(cur.rules).filter(([k, r]) => {
        if (r.times < 0 || r.baseCalls === null) return true;
        return (counters.calls?.[k] ?? 0) - r.baseCalls < r.times;
      }),
    );
    if (Object.keys(keep).length !== Object.keys(cur.rules).length) commit({ ...state, [tenant]: { ...cur, rules: keep } });
  },
};

function forget(tenant: Tenant, key: string) {
  const cur = get(tenant);
  const rules = { ...cur.rules };
  delete rules[key];
  commit({ ...state, [tenant]: { ...cur, rules } });
}

export function remainingCalls(r: ActiveRule, counters: Counters | null): number | null {
  if (r.times < 0 || r.baseCalls === null || !counters) return null;
  return Math.max(0, r.times - ((counters.calls?.[`${r.mock}/${r.op}`] ?? 0) - r.baseCalls));
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useSim(tenant: Tenant): SimTenantState {
  return useSyncExternalStore(subscribe, () => get(tenant));
}

export const isSimActive = (s: SimTenantState) => Object.keys(s.rules).length > 0 || s.callbacks.mode !== 'NORMAL';

/** While finite rules are on, poll the counters so used-up rules disappear. */
export function useSimPruning(tenant: Tenant, s: SimTenantState, onCounters?: (c: Counters) => void) {
  const finite = Object.values(s.rules).some((r) => r.times >= 0);
  useEffect(() => {
    if (!finite && !onCounters) return;
    let stopped = false;
    const tick = async () => {
      try {
        const { data } = await api.mockAdmin('GET', `/counters/${tenant}`);
        if (stopped) return;
        sim.prune(tenant, data as Counters);
        onCounters?.(data as Counters);
      } catch {
        /* mock admin not running */
      }
    };
    void tick();
    const t = setInterval(() => void tick(), 4000);
    return () => {
      stopped = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant, finite]);
}

export function describeCallbacks(c: SimTenantState['callbacks']): string {
  switch (c.mode) {
    case 'DELAY':
      return `Confirmations arrive late (${Math.round((c.delayMs ?? 0) / 1000)} s)`;
    case 'DUPLICATE':
      return 'Confirmations are sent twice';
    case 'NEVER':
      return 'Confirmations are never sent';
    default:
      return 'Confirmations normal';
  }
}
