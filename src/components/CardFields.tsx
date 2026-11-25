import { useState } from 'react';
import { isSafeRef } from '../api/client';
import { PRODUCT_CODES } from '../api/types';
import type { CardInput } from '../lib/store';
import { Field } from './ui';

/** Form state: the limit is edited in major units ("500.00") and converted on submit. */
export interface CardFormValues {
  productCode: string;
  customerRef: string;
  accountRef: string;
  spendLimit: string;
}

export const toFormValues = (i: CardInput): CardFormValues => ({
  productCode: i.productCode,
  customerRef: i.customerRef,
  accountRef: i.accountRef,
  spendLimit: (i.spendLimitMinor / 100).toFixed(2),
});

export function toMinor(major: string): number | null {
  const m = /^\s*(\d+)(?:\.(\d{1,2}))?\s*$/.exec(major.replace(/,/g, ''));
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? '0').padEnd(2, '0'));
}

export const toInput = (v: CardFormValues): CardInput => ({
  productCode: v.productCode,
  customerRef: v.customerRef,
  accountRef: v.accountRef,
  spendLimitMinor: toMinor(v.spendLimit) ?? 0,
});

export interface CardFormCheck {
  /** Blocking: the API itself would refuse. */
  errors: Partial<Record<keyof CardFormValues, string>>;
  /** Non-blocking: the API accepts it but the workflow will reject it. Useful for demos. */
  warnings: Partial<Record<keyof CardFormValues, string>>;
}

const REF_MSG = 'Use letters, digits, - or _ (up to 64). Card numbers aren\'t allowed.';

export function checkCardForm(v: CardFormValues): CardFormCheck {
  const errors: CardFormCheck['errors'] = {};
  const warnings: CardFormCheck['warnings'] = {};
  if (!isSafeRef(v.customerRef)) errors.customerRef = REF_MSG;
  if (!isSafeRef(v.accountRef)) errors.accountRef = REF_MSG;
  if (!v.productCode.trim()) errors.productCode = 'Enter a product code.';
  else if (!(PRODUCT_CODES as readonly string[]).includes(v.productCode))
    warnings.productCode = 'Unknown product: the request will be rejected.';
  const minor = toMinor(v.spendLimit);
  if (minor === null) errors.spendLimit = 'Enter an amount, e.g. 500 or 500.00.';
  else if (minor < 1 || minor > 1_000_000) warnings.spendLimit = 'Above the 10,000.00 policy limit: the request will be rejected.';
  return { errors, warnings };
}

export const PRODUCTS: { code: string; name: string; text: string }[] = [
  { code: 'VIRTUAL_STANDARD', name: 'Standard', text: 'Everyday virtual card' },
  { code: 'VIRTUAL_PREMIUM', name: 'Premium', text: 'Premium virtual card' },
];

const LIMIT_CHIPS = ['100.00', '500.00', '1000.00', '5000.00'];

export function CardFields({
  values,
  onChange,
  check,
  showErrors,
  allowCustomProduct = false,
}: {
  values: CardFormValues;
  onChange: (v: CardFormValues) => void;
  check: CardFormCheck;
  showErrors: boolean;
  allowCustomProduct?: boolean;
}) {
  const known = (PRODUCT_CODES as readonly string[]).includes(values.productCode);
  const [custom, setCustom] = useState(!known);
  const set = (k: keyof CardFormValues) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...values, [k]: e.target.value });
  const err = (k: keyof CardFormValues) => (showErrors || values[k] ? check.errors[k] : undefined) ?? null;

  return (
    <div className="card-fields">
      <Field label="Card product" error={err('productCode')} hint={check.warnings.productCode}>
        {!custom ? (
          <div className="choice-row" role="radiogroup" aria-label="Card product">
            {PRODUCTS.map((p) => (
              <button
                key={p.code}
                type="button"
                role="radio"
                aria-checked={values.productCode === p.code}
                className={`choice${values.productCode === p.code ? ' selected' : ''}`}
                onClick={() => onChange({ ...values, productCode: p.code })}
              >
                <span className="choice-radio" aria-hidden />
                <span>
                  <span className="choice-title">{p.name}</span>
                  <span className="choice-text">{p.text}</span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <input aria-label="Product code" className="mono" value={values.productCode} onChange={set('productCode')} placeholder="PRODUCT_CODE" />
        )}
        {allowCustomProduct && (
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              if (custom) onChange({ ...values, productCode: 'VIRTUAL_STANDARD' });
              setCustom(!custom);
            }}
          >
            {custom ? 'Choose from the list instead' : 'Use a different product code'}
          </button>
        )}
      </Field>

      <Field
        label="Spend limit"
        htmlFor="spendLimit"
        error={err('spendLimit')}
        hint={check.warnings.spendLimit ?? 'Up to 10,000.00'}
      >
        <div className="limit-row">
          <input
            id="spendLimit"
            inputMode="decimal"
            value={values.spendLimit}
            onChange={set('spendLimit')}
            className={`limit-input${check.warnings.spendLimit ? ' input-warn' : ''}`}
          />
          <div className="chips">
            {LIMIT_CHIPS.map((c) => (
              <button
                key={c}
                type="button"
                className={`chip${toMinor(values.spendLimit) === toMinor(c) ? ' selected' : ''}`}
                onClick={() => onChange({ ...values, spendLimit: c })}
              >
                {Number(c).toLocaleString()}
              </button>
            ))}
          </div>
        </div>
      </Field>

      <div className="form-grid">
        <Field label="Customer ID" htmlFor="customerRef" error={err('customerRef')} hint="Any test ID, e.g. customer-42">
          <input id="customerRef" value={values.customerRef} onChange={set('customerRef')} autoComplete="off" />
        </Field>
        <Field label="Account ID" htmlFor="accountRef" error={err('accountRef')} hint="The account the card spends from">
          <input id="accountRef" value={values.accountRef} onChange={set('accountRef')} autoComplete="off" />
        </Field>
      </div>
    </div>
  );
}
