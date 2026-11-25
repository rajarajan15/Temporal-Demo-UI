import { toMinor, type CardFormValues } from '../components/CardFields';

export const suffix = () => Math.random().toString(36).slice(2, 6);

export type ScenarioId = 'approved' | 'review' | 'rejected' | 'over-limit';

export interface Scenario {
  id: ScenarioId;
  icon: string;
  title: string;
  text: string;
  expect: string;
  apply: (v: CardFormValues) => CardFormValues;
}

/** Customer IDs containing "review" or "reject" steer the test KYC service. */
const baseCustomer = (ref: string) => ref.replace(/^(review|reject)-?/i, '').replace(/^customer-?/i, '') || suffix();

export const SCENARIOS: Scenario[] = [
  {
    id: 'approved',
    icon: '✓',
    title: 'Approved',
    text: 'Everything checks out',
    expect: 'The card should be active in about a second.',
    apply: (v) => ({ ...v, customerRef: `customer-${baseCustomer(v.customerRef)}`, spendLimit: withinLimit(v.spendLimit) }),
  },
  {
    id: 'review',
    icon: '?',
    title: 'Needs review',
    text: 'Identity check can\'t decide',
    expect: 'The request will pause and wait for you to approve or reject it.',
    apply: (v) => ({ ...v, customerRef: `review-${baseCustomer(v.customerRef)}`, spendLimit: withinLimit(v.spendLimit) }),
  },
  {
    id: 'rejected',
    icon: '✕',
    title: 'Rejected',
    text: 'Identity check fails',
    expect: 'The request should be rejected and no card created.',
    apply: (v) => ({ ...v, customerRef: `reject-${baseCustomer(v.customerRef)}`, spendLimit: withinLimit(v.spendLimit) }),
  },
  {
    id: 'over-limit',
    icon: '↑',
    title: 'Over the limit',
    text: 'Spend limit above policy',
    expect: 'The request should be rejected because the limit is too high.',
    apply: (v) => ({ ...v, customerRef: `customer-${baseCustomer(v.customerRef)}`, spendLimit: '20000.00' }),
  },
];

function withinLimit(major: string) {
  const m = toMinor(major);
  return m === null || m < 1 || m > 1_000_000 ? '500.00' : major;
}

/** The scenario is derived from the values, so editing a field never leaves a stale selection. */
export function scenarioOf(v: CardFormValues): ScenarioId {
  const ref = v.customerRef.toLowerCase();
  if (ref.includes('reject')) return 'rejected';
  if (ref.includes('review')) return 'review';
  const m = toMinor(v.spendLimit);
  if (m !== null && (m < 1 || m > 1_000_000)) return 'over-limit';
  return 'approved';
}
