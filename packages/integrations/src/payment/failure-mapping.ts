import { FailureCategory } from '@recoverai/domain';

/**
 * Deterministic mapping from Razorpay error codes/descriptions to the domain
 * FailureCategory taxonomy (spec §14). No AI involved — pure code.
 */
export function mapRazorpayFailureCategory(code?: string, description?: string): FailureCategory {
  const c = (code ?? '').toUpperCase();
  const d = (description ?? '').toLowerCase();

  if (c === 'INSUFFICIENT_FUNDS' || d.includes('insufficient')) return FailureCategory.INSUFFICIENT_FUNDS;
  if (c === 'CARD_EXPIRED' || d.includes('expired card') || d.includes('card expired')) return FailureCategory.EXPIRED_CARD;
  if (c === 'NETWORK_ERROR' || d.includes('network') || d.includes('timeout')) return FailureCategory.NETWORK_ERROR;
  if (c === 'AUTHENTICATION_FAILED' || d.includes('authentication') || d.includes('3ds')) return FailureCategory.AUTHENTICATION_FAILED;
  if (c === 'DO_NOT_HONOR') return FailureCategory.DO_NOT_HONOR;
  if (c.startsWith('FRAUD') || d.includes('fraud') || d.includes('suspected')) return FailureCategory.RISK_FRAUD;
  if (d.includes('invalid') || d.includes('method')) return FailureCategory.PAYMENT_METHOD_INVALID;
  if (d.includes('declin')) return FailureCategory.CARD_DECLINED;
  if (d.includes('bank') || d.includes('issuer')) return FailureCategory.TEMPORARY_BANK_ISSUE;
  if (c.startsWith('SERVER') || d.includes('provider')) return FailureCategory.PROVIDER_ERROR;
  return FailureCategory.UNKNOWN;
}
