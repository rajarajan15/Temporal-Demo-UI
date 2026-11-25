import { useEffect, useRef } from 'react';
import { api, ApiError } from '../api/client';
import type { Progress, Tenant } from '../api/types';
import { tracked, type TrackedItem } from './store';

/** Records the latest progress in local memory, adding the item if it was opened by ID. */
export function recordProgress(tenant: Tenant, kind: 'card' | 'reissue', id: string, p: Progress) {
  const patch: Partial<TrackedItem> = {
    lastStatus: p.status,
    reasonCode: p.reasonCode,
    finished: p.finished,
    parked: !!p.pendingReview,
    gone: false,
    cardId: p.card?.cardId ?? null,
  };
  if (tracked.get(tenant, kind, id)) tracked.patch(tenant, kind, id, patch);
  else tracked.upsert({ id, tenant, kind, ...patch });
}

export function recordGone(tenant: Tenant, kind: TrackedItem['kind'], id: string) {
  tracked.patch(tenant, kind, id, { gone: true });
}

/** Keeps unfinished requests for a tenant up to date while a list is on screen. */
export function useBackgroundRefresh(tenant: Tenant, items: TrackedItem[], everyMs = 3000) {
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const unfinishedKey = items
    .filter((i) => !i.finished && !i.gone && i.kind !== 'recon')
    .map((i) => i.id)
    .join(',');
  useEffect(() => {
    if (!unfinishedKey) return;
    let inFlight = false;
    const tick = async () => {
      if (document.hidden || inFlight) return;
      inFlight = true;
      await refreshItems(itemsRef.current.filter((i) => !i.finished && !i.gone));
      inFlight = false;
    };
    void tick();
    const t = setInterval(() => void tick(), everyMs);
    return () => clearInterval(t);
  }, [unfinishedKey, tenant, everyMs]);
}

/** Re-fetches tracked requests, a few at a time. */
export async function refreshItems(items: TrackedItem[], concurrency = 4): Promise<void> {
  const queue = items.filter((i) => i.kind !== 'recon');
  const worker = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      try {
        const { data } =
          item.kind === 'card'
            ? await api.getCardRequest(item.tenant, item.id)
            : await api.getReissue(item.tenant, item.id);
        recordProgress(item.tenant, item.kind as 'card' | 'reissue', item.id, data);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) recordGone(item.tenant, item.kind, item.id);
        // Transient errors: leave the last known state.
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
}
