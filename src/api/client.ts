import type {
  CreateCardBody,
  CreateCardReply,
  Progress,
  ReconResult,
  ReconStartReply,
  ReissueBody,
  ReissueReply,
  ReviewAction,
  ScheduleTriggerReply,
  Tenant,
} from './types';

/** Every non-2xx reply. `code` comes from the `{"code": "..."}` body. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly retryAfterSeconds: number | null = null,
  ) {
    super(`${status} ${code}`);
  }

  /** 503s mean "try again shortly"; the backend may still apply the action later. */
  get isUnavailable() {
    return this.status === 503;
  }
}

/** Network failure (proxy up, backend down, or no proxy at all). */
export const NETWORK_ERROR = 'NETWORK_ERROR';

interface CallOptions {
  tenant?: Tenant;
  idempotencyKey?: string;
  body?: unknown;
  signal?: AbortSignal;
}

export interface Reply<T> {
  status: number;
  data: T;
}

async function call<T>(method: string, path: string, opts: CallOptions = {}): Promise<Reply<T>> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.tenant) headers['X-Tenant-Id'] = opts.tenant;
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, NETWORK_ERROR);
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const code =
      data && typeof data === 'object' && 'code' in data && typeof (data as { code: unknown }).code === 'string'
        ? (data as { code: string }).code
        : // The Vite proxy answers a plain-text 500 (other proxies 502-504) when the backend is down.
          // The backend's own errors always carry a JSON code, so a bare 5xx means unreachable.
          res.status >= 500
          ? 'BACKEND_UNREACHABLE'
          : `HTTP_${res.status}`;
    const retryAfter = res.headers.get('Retry-After');
    throw new ApiError(res.status, code, retryAfter ? Number(retryAfter) || null : null);
  }

  return { status: res.status, data: data as T };
}

/**
 * Client-chosen request ID: 1-64 of letters, digits, `_` and `-`.
 * The backend runs keys through its card-number guard too, and about 2% of random UUIDs
 * contain 13+ digits separated only by dashes, which it rejects as INVALID_REQUEST.
 * Draw again until the key is safe.
 */
export function newKey(): string {
  let key: string;
  do key = crypto.randomUUID();
  while (CARD_NUMBER_IN_REF.test(key));
  return key;
}

export const KEY_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
export const REF_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
/** Mirrors ApiResponses.java: the API refuses anything that could be a card number (13+ digits). */
export const CARD_NUMBER_IN_REF = /\d(?:[_-]?\d){12,}/;
export const CARD_NUMBER_IN_TEXT = /\d(?:[\s._-]?\d){12,}/;

/** A reference (customerRef, accountRef, reviewer) the API will accept. */
export const isSafeRef = (v: string) => REF_PATTERN.test(v) && !CARD_NUMBER_IN_REF.test(v);

export const api = {
  createCard: (tenant: Tenant, key: string, body: CreateCardBody) =>
    call<CreateCardReply | Progress>('POST', '/v1/card-requests', { tenant, idempotencyKey: key, body }),

  getCardRequest: (tenant: Tenant, id: string, signal?: AbortSignal) =>
    call<Progress>('GET', `/v1/card-requests/${encodeURIComponent(id)}`, { tenant, signal }),

  decide: (tenant: Tenant, id: string, key: string, action: ReviewAction, reviewer: string) =>
    call<{ kind: string; action: ReviewAction }>('POST', `/v1/card-requests/${encodeURIComponent(id)}/approvals`, {
      tenant,
      idempotencyKey: key,
      body: { action, reviewer },
    }),

  cancel: (tenant: Tenant, id: string, key: string, reason?: string) =>
    call<{ accepted: boolean }>('POST', `/v1/card-requests/${encodeURIComponent(id)}/cancel`, {
      tenant,
      idempotencyKey: key,
      body: reason ? { reason } : undefined,
    }),

  reissue: (tenant: Tenant, cardId: string, key: string, body: ReissueBody) =>
    call<ReissueReply | Progress>('POST', `/v1/cards/${encodeURIComponent(cardId)}/reissue`, {
      tenant,
      idempotencyKey: key,
      body,
    }),

  getReissue: (tenant: Tenant, id: string, signal?: AbortSignal) =>
    call<Progress>('GET', `/v1/reissues/${encodeURIComponent(id)}`, { tenant, signal }),

  startRecon: (tenant: Tenant, key: string, pageSize?: number) =>
    call<ReconStartReply>('POST', '/v1/reconciliations', {
      tenant,
      idempotencyKey: key,
      body: pageSize ? { pageSize } : undefined,
    }),

  getRecon: (tenant: Tenant, runId: string, signal?: AbortSignal) =>
    call<ReconResult>('GET', `/v1/reconciliations/${encodeURIComponent(runId)}`, { tenant, signal }),

  triggerSchedule: (tenant: Tenant) =>
    call<ScheduleTriggerReply>('POST', '/v1/reconciliations/schedule/trigger', { tenant }),

  /** Mock admin (development only). Bodies are free-form JSON. */
  mockAdmin: (method: string, path: string, body?: unknown) => call<unknown>(method, `/mock-admin${path}`, { body }),
};
