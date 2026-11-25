import type { Tenant } from '../api/types';

const BASE = (import.meta.env.VITE_TEMPORAL_UI_URL as string | undefined) ?? 'http://localhost:8233';
const NAMESPACE = (import.meta.env.VITE_TEMPORAL_NAMESPACE as string | undefined) ?? 'default';

/** Workflow ID prefixes, from the backend controllers (CardRequestController, ReissueController, ReconciliationController). */
const PREFIX = { card: 'card', reissue: 'reissue', recon: 'reconcile' } as const;

export type WorkflowKind = keyof typeof PREFIX;

export function workflowId(kind: WorkflowKind, tenant: Tenant, id: string): string {
  return `${PREFIX[kind]}-${tenant}-${id}`;
}

export function workflowUrl(kind: WorkflowKind, tenant: Tenant, id: string): string {
  return `${BASE}/namespaces/${NAMESPACE}/workflows/${encodeURIComponent(workflowId(kind, tenant, id))}`;
}

function searchUrl(query: string): string {
  return `${BASE}/namespaces/${NAMESPACE}/workflows?query=${encodeURIComponent(query)}`;
}

/** The parked-request search the backend doc recommends until Milestone 7 adds an operator queue. */
export function parkedSearchUrl(tenant: Tenant): string {
  return searchUrl(`CardStatus = "UNDER_REVIEW" AND ExecutionStatus = "Running" AND WorkflowId STARTS_WITH "card-${tenant}-"`);
}

/**
 * Nightly reconciliation runs are started by the Temporal schedule `recon-{tenant}`,
 * which names its workflows `{scheduleId}-{timestamp}`. Their results are only visible in Temporal.
 */
export function scheduleUrl(scheduleId: string): string {
  return `${BASE}/namespaces/${NAMESPACE}/schedules/${encodeURIComponent(scheduleId)}`;
}

export function nightlyRunsUrl(tenant: Tenant): string {
  return searchUrl(`WorkflowId STARTS_WITH "recon-${tenant}-"`);
}

export function workflowsUrl(): string {
  return `${BASE}/namespaces/${NAMESPACE}/workflows`;
}
