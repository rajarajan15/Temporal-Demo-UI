import { describe, expect, it } from 'vitest';
import { CARD_NUMBER_IN_REF, CARD_NUMBER_IN_TEXT, isSafeRef, KEY_PATTERN, newKey } from '../api/client';
import type { Progress, Step } from '../api/types';
import { checkCardForm, toMinor, type CardFormValues } from '../components/CardFields';
import { describeItem, describeProgress, needsDecision, plainReason } from './describe';
import { SCENARIOS, scenarioOf } from './scenarios';
import { remainingCalls, type ActiveRule } from './simState';
import type { TrackedItem } from './store';

const form = (o: Partial<CardFormValues> = {}): CardFormValues => ({
  productCode: 'VIRTUAL_STANDARD',
  customerRef: 'customer-1',
  accountRef: 'account-1',
  spendLimit: '500.00',
  ...o,
});

const step = (name: string, state: Step['state'], extra: Partial<Step> = {}): Step => ({
  name,
  state,
  lastErrorCode: null,
  startedAtMillis: null,
  finishedAtMillis: null,
  ...extra,
});

const ISSUANCE = ['validateRequest', 'runKyc', 'createCard', 'awaitConfirmation', 'setLimits', 'activateCard', 'sendNotification'];

const progress = (o: Partial<Progress> = {}): Progress => ({
  status: 'REQUESTED',
  reasonCode: null,
  card: null,
  steps: ISSUANCE.map((n) => step(n, 'PENDING')),
  pendingReview: null,
  finished: false,
  ...o,
});

describe('toMinor', () => {
  it.each([
    ['500', 50000],
    ['500.5', 50050],
    ['500.05', 50005],
    ['1,000.00', 100000],
    [' 0.01 ', 1],
  ])('%s -> %d', (input, expected) => expect(toMinor(input)).toBe(expected));

  it.each(['', 'abc', '1.234', '-5', '5.'])('rejects %j', (input) => expect(toMinor(input)).toBeNull());
});

describe('card-number guards mirror ApiResponses.java', () => {
  it('flags 13+ digits in references, allowing _ and - separators', () => {
    expect(CARD_NUMBER_IN_REF.test('4111111111111')).toBe(true);
    expect(CARD_NUMBER_IN_REF.test('4111-1111-1111-1111')).toBe(true);
    expect(CARD_NUMBER_IN_REF.test('customer-123456789012')).toBe(false); // 12 digits
  });
  it('also allows spaces and dots in free text', () => {
    expect(CARD_NUMBER_IN_TEXT.test('card 4111 1111 1111 1111 lost')).toBe(true);
    expect(CARD_NUMBER_IN_TEXT.test('4111.1111.1111.1')).toBe(true);
    expect(CARD_NUMBER_IN_TEXT.test('customer-request')).toBe(false);
  });
  it('isSafeRef applies the pattern and the guard', () => {
    expect(isSafeRef('ops-1')).toBe(true);
    expect(isSafeRef('has space')).toBe(false);
    expect(isSafeRef('x'.repeat(65))).toBe(false);
    expect(isSafeRef('acct-4111111111111111')).toBe(false);
  });
  it('generated request keys always pass the backend guard', () => {
    // ~2% of raw UUIDs fail it, so 20k draws would almost surely catch a regression.
    for (let i = 0; i < 20000; i++) {
      const k = newKey();
      expect(KEY_PATTERN.test(k) && isSafeRef(k)).toBe(true);
    }
  });
  it('a raw UUID can fail the guard (why newKey redraws)', () => {
    expect(isSafeRef('1b4e28ba-2fa1-4111-1111-111111111111')).toBe(false);
  });
});

describe('checkCardForm', () => {
  it('accepts the defaults', () => {
    const c = checkCardForm(form());
    expect(c.errors).toEqual({});
    expect(c.warnings).toEqual({});
  });
  it('blocks what the API would refuse', () => {
    const c = checkCardForm(form({ customerRef: '', accountRef: 'a b', spendLimit: 'x' }));
    expect(Object.keys(c.errors).sort()).toEqual(['accountRef', 'customerRef', 'spendLimit']);
  });
  it('only warns about what the workflow would reject, so demos can submit it', () => {
    const c = checkCardForm(form({ productCode: 'GOLD', spendLimit: '20000' }));
    expect(c.errors).toEqual({});
    expect(Object.keys(c.warnings).sort()).toEqual(['productCode', 'spendLimit']);
  });
});

describe('scenarios', () => {
  it('each scenario produces values detected as that scenario', () => {
    for (const s of SCENARIOS) expect(scenarioOf(s.apply(form()))).toBe(s.id);
  });
  it('switching scenarios keeps the customer suffix', () => {
    const review = SCENARIOS.find((s) => s.id === 'review')!.apply(form({ customerRef: 'customer-ab12' }));
    expect(review.customerRef).toBe('review-ab12');
    const back = SCENARIOS.find((s) => s.id === 'approved')!.apply(review);
    expect(back.customerRef).toBe('customer-ab12');
  });
  it('leaving over-limit restores a valid limit', () => {
    const over = SCENARIOS.find((s) => s.id === 'over-limit')!.apply(form());
    expect(over.spendLimit).toBe('20000.00');
    expect(SCENARIOS[0].apply(over).spendLimit).toBe('500.00');
  });
});

describe('describeProgress', () => {
  it('reports the current step while running', () => {
    const p = progress({
      steps: ISSUANCE.map((n, i) => step(n, i < 3 ? 'DONE' : i === 3 ? 'WAITING' : 'PENDING')),
    });
    const d = describeProgress(p);
    expect(d.tone).toBe('info');
    expect(d.text).toContain('Step 4 of 7');
    expect(d.text).toContain('waiting for the processor');
  });

  it('asks for a decision when parked, by kind', () => {
    const p = progress({
      status: 'UNDER_REVIEW',
      pendingReview: { kind: 'RETRIES_EXHAUSTED', step: 'createCard', reasonCode: 'RETRIES_EXHAUSTED', sinceMillis: 1 },
    });
    const d = describeProgress(p);
    expect(d.title).toBe('Waiting for your decision');
    expect(d.text).toContain('"Create card" kept failing');
  });

  it('mentions the rollback when undo steps ran', () => {
    const p = progress({
      status: 'REJECTED',
      reasonCode: 'ACTIVATION_DECLINED',
      finished: true,
      steps: [...ISSUANCE.map((n) => step(n, 'DONE')), step('resetLimits', 'COMPENSATED'), step('cancelCard', 'COMPENSATED')],
    });
    const d = describeProgress(p);
    expect(d.tone).toBe('danger');
    expect(d.text).toContain('declined to activate');
    expect(d.text).toContain('undone');
  });

  it('treats a final UNDER_REVIEW as manual cleanup', () => {
    const d = describeProgress(progress({ status: 'UNDER_REVIEW', reasonCode: 'COMPENSATION_FAILED', finished: true }));
    expect(d.title).toBe('Needs manual cleanup');
  });

  it('notes a failed notification on an active card', () => {
    const steps = ISSUANCE.map((n) => step(n, n === 'sendNotification' ? 'FAILED' : 'DONE'));
    const d = describeProgress(progress({ status: 'ACTIVE', finished: true, steps }));
    expect(d.tone).toBe('success');
    expect(d.text).toContain('notification failed');
  });

  it('falls back for unknown processor codes', () => {
    expect(plainReason('SOMETHING_NEW')).toContain('SOMETHING_NEW');
  });
});

describe('list helpers', () => {
  const item = (o: Partial<TrackedItem>): TrackedItem => ({
    id: 'r1',
    tenant: 'bank-a',
    kind: 'card',
    createdAt: 0,
    updatedAt: 0,
    ...o,
  });
  it('needsDecision covers parked and manual cleanup, not expired', () => {
    expect(needsDecision(item({ parked: true, finished: false }))).toBe(true);
    expect(needsDecision(item({ finished: true, lastStatus: 'UNDER_REVIEW' }))).toBe(true);
    expect(needsDecision(item({ parked: true, gone: true }))).toBe(false);
    expect(needsDecision(item({ finished: true, lastStatus: 'ACTIVE' }))).toBe(false);
  });
  it('describeItem explains expiry', () => {
    expect(describeItem(item({ gone: true }))).toContain('24 hours');
  });
});

describe('remainingCalls', () => {
  const rule = (o: Partial<ActiveRule>): ActiveRule => ({
    mock: 'processor',
    op: 'createCard',
    title: 't',
    rule: {},
    times: 2,
    baseCalls: 5,
    at: 0,
    ...o,
  });
  it('counts down from the calls seen since the rule was set', () => {
    expect(remainingCalls(rule({}), { calls: { 'processor/createCard': 6 } })).toBe(1);
    expect(remainingCalls(rule({}), { calls: { 'processor/createCard': 9 } })).toBe(0);
  });
  it('is unknown for every-call rules or missing counters', () => {
    expect(remainingCalls(rule({ times: -1 }), { calls: {} })).toBeNull();
    expect(remainingCalls(rule({ baseCalls: null }), { calls: {} })).toBeNull();
    expect(remainingCalls(rule({}), null)).toBeNull();
  });
});
