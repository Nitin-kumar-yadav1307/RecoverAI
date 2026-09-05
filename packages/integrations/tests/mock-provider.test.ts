import { createHmac } from 'node:crypto';
import { MockPaymentProvider } from '../src/payment/mock';

describe('MockPaymentProvider', () => {
  const provider = new MockPaymentProvider();

  it('verifies its own HMAC signatures and rejects tampering', () => {
    const { body, signature } = provider.buildWebhookBody({
      event: 'payment.failed',
      externalPaymentId: 'pay_x1',
      amountMinor: 99900,
      failureCode: 'INSUFFICIENT_FUNDS',
    });
    expect(provider.verifyWebhookSignature(body, signature, 'mock_webhook_secret')).toBe(true);
    expect(provider.verifyWebhookSignature(body + ' ', signature, 'mock_webhook_secret')).toBe(false);
    expect(provider.verifyWebhookSignature(body, 'de' + signature.slice(2), 'mock_webhook_secret')).toBe(false);
  });

  it('maps failure categories deterministically', () => {
    const { body } = provider.buildWebhookBody({
      event: 'payment.failed',
      externalPaymentId: 'pay_x2',
      amountMinor: 1,
      failureCode: 'CARD_EXPIRED',
    });
    const event = provider.parseWebhookEvent(body);
    expect(event.failureCategory).toBe('EXPIRED_CARD');
    expect(event.eventType).toBe('payment.failed');
  });

  it('simulates retry success unless the payment is marked always_fail', async () => {
    const ok = await provider.retryPayment({ externalPaymentId: 'pay_ok', amountMinor: 100, idempotencyKey: 'k1' });
    const fail = await provider.retryPayment({ externalPaymentId: 'pay_always_fail_1', amountMinor: 100, idempotencyKey: 'k2' });
    expect(ok.status).toBe('INITIATED');
    expect(fail.status).toBe('FAILED');
    expect(createHmac('sha256', 'x').update('y').digest('hex')).toBeTruthy(); // sanity: crypto available
  });
});
