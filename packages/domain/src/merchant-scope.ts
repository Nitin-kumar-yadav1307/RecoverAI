import { MerchantIsolationError } from './errors';

/**
 * Every resource must be scoped to a merchant. The merchant id used must come
 * from an authenticated, authorized session (spec §41) - never merely from the
 * browser. This helper is the single choke point to enforce that boundary.
 */
export function assertMerchantScope(
  authenticatedMerchantId: string,
  resource: { merchant_id: string; [k: string]: unknown },
  resourceName: string,
): void {
  if (authenticatedMerchantId !== resource.merchant_id) {
    throw new MerchantIsolationError(resourceName, authenticatedMerchantId, resource.merchant_id);
  }
}