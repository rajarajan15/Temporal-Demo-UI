import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, NETWORK_ERROR } from '../api/client';

/**
 * Progress is polled (no websockets or SSE). Poll about once a second until
 * the result is final. 503s and network blips are transient: keep polling,
 * honouring Retry-After. Other errors (404, 500) stop the loop.
 */
export interface PollState<T> {
  data: T | null;
  /** Fatal error that stopped polling. */
  error: ApiError | null;
  /** Latest transient error; polling continues. Cleared on the next success. */
  transient: ApiError | null;
  polling: boolean;
  lastUpdated: number | null;
  refresh: () => void;
}

interface Options<T> {
  /** Changing the key resets the state and restarts polling. */
  key: string;
  fetcher: (signal: AbortSignal) => Promise<T>;
  isDone: (data: T) => boolean;
  intervalMs?: number;
  onData?: (data: T) => void;
  onError?: (err: ApiError) => void;
}

const isTransient = (e: ApiError) =>
  e.status === 503 || e.code === NETWORK_ERROR || e.code === 'BACKEND_UNREACHABLE';

export function usePoll<T>({ key, fetcher, isDone, intervalMs = 1000, onData, onError }: Options<T>): PollState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [transient, setTransient] = useState<ApiError | null>(null);
  const [polling, setPolling] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [run, setRun] = useState(0);

  const cb = useRef({ fetcher, isDone, onData, onError });
  cb.current = { fetcher, isDone, onData, onError };

  // Reset when the thing being polled changes.
  useEffect(() => {
    setData(null);
    setError(null);
    setTransient(null);
    setLastUpdated(null);
  }, [key]);

  useEffect(() => {
    const ctrl = new AbortController();
    let timer: number | undefined;
    let stopped = false;
    setPolling(true);
    setError(null);

    const tick = async () => {
      if (stopped) return;
      if (document.hidden) {
        timer = window.setTimeout(tick, intervalMs);
        return;
      }
      try {
        const result = await cb.current.fetcher(ctrl.signal);
        if (stopped) return;
        setData(result);
        setTransient(null);
        setLastUpdated(Date.now());
        cb.current.onData?.(result);
        if (cb.current.isDone(result)) {
          setPolling(false);
          return;
        }
        timer = window.setTimeout(tick, intervalMs);
      } catch (e) {
        if (stopped || (e as Error).name === 'AbortError') return;
        const err = e instanceof ApiError ? e : new ApiError(0, NETWORK_ERROR);
        cb.current.onError?.(err);
        if (isTransient(err)) {
          setTransient(err);
          const wait = err.retryAfterSeconds ? Math.min(err.retryAfterSeconds * 1000, 5000) : intervalMs * 2;
          timer = window.setTimeout(tick, wait);
        } else {
          setError(err);
          setPolling(false);
        }
      }
    };

    void tick();
    return () => {
      stopped = true;
      ctrl.abort();
      window.clearTimeout(timer);
    };
  }, [key, run, intervalMs]);

  const refresh = useCallback(() => setRun((r) => r + 1), []);

  return { data, error, transient, polling, lastUpdated, refresh };
}
