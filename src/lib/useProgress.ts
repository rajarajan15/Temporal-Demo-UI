import { api } from '../api/client';
import type { Progress, Tenant } from '../api/types';
import { recordGone, recordProgress } from './sync';
import { usePoll } from './usePoll';

/** Polls a card request or reissue until finished, mirroring results into local memory. */
export function useProgress(tenant: Tenant, kind: 'card' | 'reissue', id: string) {
  return usePoll<Progress>({
    key: `${tenant}:${kind}:${id}`,
    fetcher: (signal) =>
      (kind === 'card' ? api.getCardRequest(tenant, id, signal) : api.getReissue(tenant, id, signal)).then((r) => r.data),
    isDone: (p) => p.finished,
    onData: (p) => recordProgress(tenant, kind, id, p),
    onError: (e) => {
      if (e.status === 404) recordGone(tenant, kind, id);
    },
  });
}
