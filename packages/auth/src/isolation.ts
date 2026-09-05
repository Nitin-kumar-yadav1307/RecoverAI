import { assertMerchantScope, MerchantIsolationError } from '@recoverai/domain';
import { AuthenticatedPrincipal } from './principal';

/**
 * Merchant-isolation authorization gate.
 *
 * Every tenant-scoped resource must be checked against the authenticated
 * principal. The principal's merchant_id comes from the verified JWT, never
 * from the browser. This wraps the domain-level `assertMerchantScope` so auth
 * and domain share one rule and one error type.
 */

export type TenantResource = { merchant_id: string; id?: string };

/**
 * Verify that `principal` may access a tenant-scoped resource. Throws
 * MerchantIsolationError otherwise (which callers translate to 403).
 */
export function authorizeTenantAccess(
  principal: AuthenticatedPrincipal,
  resource: TenantResource,
  resourceName: string,
): void {
  assertMerchantScope(principal.merchantId, resource as { merchant_id: string }, resourceName);
}

/** True when the principal owns the resource (no throw). */
export function ownsResource(
  principal: AuthenticatedPrincipal,
  resource: TenantResource,
): boolean {
  return principal.merchantId === resource.merchant_id;
}

export { MerchantIsolationError };