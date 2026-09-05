import { MessagingProvider } from './types';
import { ResendMessagingProvider } from './resend';
import { MockMessagingProvider } from './mock';

/**
 * Message provider factory — uses Resend when a key is present, otherwise the
 * simulator (safe for keyless local/test runs). Deterministic fallback (§47).
 */
export function createMessagingProvider(env: {
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
  MESSAGING_FORCE_MOCK?: string;
}): MessagingProvider {
  if (env.MESSAGING_FORCE_MOCK === 'true') return new MockMessagingProvider();
  if (env.RESEND_API_KEY && env.RESEND_FROM) {

    return new ResendMessagingProvider(env.RESEND_API_KEY, env.RESEND_FROM);
  }
  return new MockMessagingProvider();
}

/** Merchant-branded recovery email body. */
export function buildRecoveryEmail(input: {
  customerName: string;
  amountInr: number;
  externalPaymentId: string;
  reasoning?: {
    failureReason?: string | null;
    strategyName?: string | null;
    actionRationale?: string | null;
  };
}): { subject: string; html: string } {
  const amt = `₹${input.amountInr.toLocaleString('en-IN')}`;
  const r = input.reasoning;
  const reasoningHtml = r?.failureReason || r?.actionRationale
    ? `
            <div style="background:#0f1730;border:1px solid #24304f;border-radius:8px;padding:14px;margin:0 0 16px">
              <p style="margin:0 0 6px;font-size:12px;letter-spacing:1px;color:#8b97b8;text-transform:uppercase">Why this happened</p>
              <p style="margin:0 0 10px">${r?.failureReason ?? 'Your bank declined the payment.'}</p>
              ${r?.actionRationale ? `
              <p style="margin:0 0 6px;font-size:12px;letter-spacing:1px;color:#8b97b8;text-transform:uppercase">What we're doing</p>
              <p style="margin:0">${r.actionRationale}</p>` : ''}
              ${r?.strategyName ? `
              <p style="margin:10px 0 0;font-size:11px;color:#5b6a94">Agent strategy: ${r.strategyName}</p>` : ''}
            </div>`
    : '';
  return {
    subject: `Your ${amt} payment didn't go through — options inside`,
    html: `
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
        style="font-family:Arial,sans-serif;background:#0b1020;padding:24px">
        <tr><td align="center">
          <div style="max-width:520px;background:#131a30;border:1px solid #24304f;
               border-radius:12px;padding:28px;color:#e8ecf8">
            <h2 style="margin:0 0 8px">RecoverAI</h2>
            <p style="color:#8b97b8;margin:0 0 16px">A payment for your account remains unpaid.</p>
            <p>Hi <strong>${input.customerName}</strong>,</p>
            <p>We attempted a payment of <strong style="color:#fbbf24">${amt}</strong>
               (ref ${input.externalPaymentId}) but the card/bank declined it either plan:</p>
            ${reasoningHtml}
            <ul style="color:#e8ecf8">
              <li>Add an updated payment method, or</li>
              <li>Pay when it suits you — reply with a date you&apos;ll pay</li>
            </ul>
            <p style="color:#8b97b8;font-size:12px;border-top:1px solid #24304f;padding-top:12px;margin-top:16px">
              This is an automated recovery message from RecoverAI.</p>
          </div>
        </td></tr>
      </table>`,
  };
}