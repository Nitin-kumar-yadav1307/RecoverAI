import { createHmac } from 'node:crypto';
import { RazorpayPaymentProvider } from '../src/payment/razorpay';
import { MockPaymentProvider } from '../src/payment/mock';

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

const WEBHOOK_SECRET = 'whsec_test_123';

const RZP_BODY = JSON.stringify({
  event: 'payment.failed',
  payload: {
    payment: {
      entity: {
        id: 'pay_RZP1',
        amount: 149900,
        currency: 'INR',
        status: 'failed',
        error_code: 'INSUFFICIENT_FUNDS',
        error_description: 'Insufficient funds at issuer',
        customer_id: 'cust_RZP9',
        created_at: 1756708800,
      },
    },
  },
});

describe('RazorpayPaymentProvider webhook verification (spec §51)', () => {
  const provider = new RazorpayPaymentProvider('rzp_test_key', 'rzp_test_secret');

  it('accepts a valid HMAC-SHA256 signature over the raw body', () => {
    expect(provider.verifyWebhookSignature(RZP_BODY, sign(RZP_BODY, WEBHOOK_SECRET), WEBHOOK_SECRET)).toBe(true);
  });

  it('rejects tampered bodies, wrong secrets, and malformed signatures', () => {
    expect(provider.verifyWebhookSignature(RZP_BODY, sign(RZP_BODY + 'x', WEBHOOK_SECRET), WEBHOOK_SECRET)).toBe(false);
    expect(provider.verifyWebhookSignature(RZP_BODY, sign(RZP_BODY, 'other'), WEBHOOK_SECRET)).toBe(false);
    expect(provider.verifyWebhookSignature(RZP_BODY, 'not-hex!', WEBHOOK_SECRET)).toBe(false);
    expect(provider.verifyWebhookSignature(RZP_BODY, 'abcd', WEBHOOK_SECRET)).toBe(false);
    expect(provider.verifyWebhookSignature(RZP_BODY, '', WEBHOOK_SECRET)).toBe(false);
  });

  it('parses and normalizes a failed payment with deterministic category', () => {
    const evt = provider.parseWebhookEvent(RZP_BODY);
    expect(evt.provider).toBe('razorpay');
    expect(evt.externalPaymentId).toBe('pay_RZP1');
    expect(evt.amountMinor).toBe(149900);
    expect(evt.failureCategory).toBe('INSUFFICIENT_FUNDS');
    expect(evt.eventType).toBe('payment.failed');
    expect(evt.providerEventId).toContain('pay_RZP1');
  });

  it('throws on unsupported events and malformed payloads', () => {
    expect(() => provider.parseWebhookEvent(JSON.stringify({ event: 'refund.processed' }))).toThrow();
    expect(() => provider.parseWebhookEvent('not-json')).toThrow();
  });

  it('parses captured payments as success', () => {
    const captured = RZP_BODY.replace('payment.failed', 'payment.captured');
    const evt = provider.parseWebhookEvent(captured);
    expect(evt.eventType).toBe('payment.captured');
  });

  it('maps unknown error codes to UNKNOWN, not to a wrong category', () => {
    const p = new MockPaymentProvider();
    const { body } = p.buildWebhookBody({ event: 'payment.failed', externalPaymentId: 'pay_u', amountMinor: 1, failureCode: 'WEIRD' });
    expect(p.parseWebhookEvent(body).failureCategory).toBe('UNKNOWN');
  });
});
