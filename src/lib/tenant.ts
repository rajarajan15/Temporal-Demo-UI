import { useParams } from 'react-router-dom';
import { TENANTS, type Tenant } from '../api/types';
import { prefs } from './store';

export const isTenant = (v: string | undefined): v is Tenant => !!v && (TENANTS as readonly string[]).includes(v);

export function defaultTenant(): Tenant {
  const t = prefs.get('tenant', TENANTS[0]);
  return isTenant(t) ? t : TENANTS[0];
}

/** The tenant is part of the URL so links always fetch with the tenant that owns the request. */
export function useTenant(): Tenant {
  const { tenant } = useParams();
  return isTenant(tenant) ? tenant : defaultTenant();
}

export const TENANT_NAMES: Record<Tenant, string> = { 'bank-a': 'Bank A', 'bank-b': 'Bank B' };
