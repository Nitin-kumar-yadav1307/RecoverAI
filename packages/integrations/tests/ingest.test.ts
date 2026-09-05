import { FailureCategory } from '@recoverai/domain';
import { IngestionStore, ingestPaymentEvent, computePriority, OPEN_CASE_STATUS_STRINGS, IngestionPayment, IngestionCustomer } from '../src/webhook/ingest';
import { NormalizedPaymentEvent } from '../src/payment/types';
import { MockPaymentProvider } from '../src/payment/mock';

/** Deterministic in-memory store (spec §71: mocks for tests only). */
class MemoryStore implements IngestionStore {
  events = new Map<string, { id: string; processed: boolean }>();
  payments = new Map<string, IngestionPayment>();
  cases: { id: string; paymentId: string; status: string }[] = [];
  audits: unknown[] = [];
  private seq = 0;
  private customer: IngestionCustomer = { id: 'cus_1', merchantId: 'mer_1', externalCustomerId: 'ext_c1' };

  async findEventByKey(k: string) { return this.events.get(k) ?? null; }
  async createEvent(i: { idempotencyKey: string }) {
    const id = `evt_${++this.seq}`;
    this.events.set(i.idempotencyKey, { id, processed: false });
    return { id };
  }
  async markEventProcessed(id: string) { for (const v of this.events.values()) if (v.id === id) v.processed = true; }
  async markEventFailed(_id: string, _e: string) { /* recorded in real impl */ }
  async findCustomer(_m: string, ext: string) { return ext === 'ext_c1' ? this.customer : null; }
  async findOrCreateCustomer(_m: string, _ext: string) { return this.customer; }
  async findPaymentByExternalId(ext: string) { return this.payments.get(ext) ?? null; }
  async upsertPayment(i: { externalPaymentId: string; status: string }) {
    const p: IngestionPayment = { id: `pay_${++this.seq}`, merchantId: 'mer_1', status: i.status, attemptCount: 1 };
    this.payments.set(i.externalPaymentId, p);
    return p;
  }
  async findOpenCaseForPayment(paymentId: string) {
    return this.cases.find((c) => c.paymentId === paymentId && OPEN_CASE_STATUS_STRINGS.includes(c.status)) ?? null;
  }
  async createRecoveryCase(i: { paymentId: string }) {
    const c = { id: `rc_${++this.seq}`, paymentId: i.paymentId, status: 'OPEN' };
    this.cases.push(c);
    return c;
  }
  async updateCaseStatus(id: string, s: string) { const c = this.cases.find((x) => x.id === id); if (c) c.status = s; }
  revenue: { caseId: string; amountMinor: number }[] = [];
  async recordRevenue(i: { caseId: string; amountMinor: number }) {
    if (this.revenue.some((r) => r.caseId === i.caseId)) return { recorded: false };
    this.revenue.push({ caseId: i.caseId, amountMinor: i.amountMinor });
    return { recorded: true };
  }
  promises: { customerId: string; status: string; promised_for: Date }[] = [];
  async fulfillActivePromises(customerId: string) {
    let n = 0;
    for (const p of this.promises) if (p.customerId === customerId && p.status === 'ACTIVE') { p.status = 'FULFILLED'; n++; }
    return n;
  }
  async breakExpiredPromises(now: Date) {
    let n = 0;
    for (const p of this.promises) if (p.status === 'ACTIVE' && now > p.promised_for) { p.status = 'BROKEN'; n++; }
    return n;
  }
  async writeAuditEvent(i: unknown) { this.audits.push(i); }
}

function failedEvent(overrides: Partial<NormalizedPaymentEvent> = {}): NormalizedPaymentEvent {
  return {
    provider: 'razorpay',
    providerEventId: 'rzp_pay_1_payment.failed',
    eventType: 'payment.failed',
    externalPaymentId: 'pay_1',
    externalCustomerId: 'ext_c1',
    amountMinor: 99900,
    currency: 'INR',
    failureCode: 'INSUFFICIENT_FUNDS',
    failureCategory: FailureCategory.INSUFFICIENT_FUNDS,
    occurredAt: new Date(),
    raw: {},
    ...overrides,
  };
}

describe('ingestPaymentEvent (spec §16/§17)', () => {
  it('opens exactly one OPEN case for a failed payment', async () => {
    const store = new MemoryStore();
    const r1 = await ingestPaymentEvent(store, failedEvent());
    expect(r1.duplicate).toBe(false);
    expect(r1.caseStatus).toBe('OPEN');
    expect(store.cases).toHaveLength(1);
    // A second failure webhook for the same payment must NOT open a second case.
    const r2 = await ingestPaymentEvent(store, failedEvent({ providerEventId: 'rzp_pay_1_payment.failed_dup' }));
    expect(r2.caseId).toBe(r1.caseId);
    expect(store.cases).toHaveLength(1);
  });

  it('is idempotent: the same webhook is processed exactly once (spec §16)', async () => {
    const store = new MemoryStore();
    const r1 = await ingestPaymentEvent(store, failedEvent());
    const r2 = await ingestPaymentEvent(store, failedEvent());
    expect(r1.duplicate).toBe(false);
    expect(r2.duplicate).toBe(true);
    expect(store.cases).toHaveLength(1);
  });

  it('a captured payment closes the open case as RECOVERED and audits it', async () => {
    const store = new MemoryStore();
    const f = await ingestPaymentEvent(store, failedEvent());
    const c = await ingestPaymentEvent(store, failedEvent({
      providerEventId: 'rzp_pay_1_payment.captured',
      eventType: 'payment.captured',
    }));
    expect(c.caseStatus).toBe('RECOVERED');
    expect(store.cases[0].status).toBe('RECOVERED');
    expect(store.audits.some((a) => (a as { eventType: string }).eventType === 'recovery.recovered')).toBe(true);
    expect(f.caseId).toBe(c.caseId);
  });

  it('writes an audit event when a case is opened', async () => {
    const store = new MemoryStore();
    await ingestPaymentEvent(store, failedEvent());
    const audit = store.audits[0] as { eventType: string; entityType: string };
    expect(audit.eventType).toBe('recovery.case_opened');
    expect(audit.entityType).toBe('recovery_case');
  });
});

describe('revenue attribution + promise lifecycle (STEP 7, spec §18/§28/§29)', () => {
  it('attributes revenue exactly once per recovered case (no double counting)', async () => {
    const store = new MemoryStore();
    await ingestPaymentEvent(store, failedEvent());
    await ingestPaymentEvent(store, failedEvent({ providerEventId: 'rzp_cap_1', eventType: 'payment.captured' }));
    // Duplicate captured webhook replay — must not double-attribute.
    await ingestPaymentEvent(store, failedEvent({ providerEventId: 'rzp_cap_1', eventType: 'payment.captured' }));
    expect(store.revenue).toHaveLength(1);
    expect(store.revenue[0].amountMinor).toBe(99900);
  });

  it('marks the customer\'s ACTIVE promise FULFILLED when payment is captured', async () => {
    const store = new MemoryStore();
    store.promises.push({ customerId: 'cus_1', status: 'ACTIVE', promised_for: new Date(Date.now() + 86_400_000) });
    await ingestPaymentEvent(store, failedEvent({ providerEventId: 'rzp_cap_2', eventType: 'payment.captured' }));
    expect(store.promises[0].status).toBe('FULFILLED');
  });

  it('a capture closes an OBSERVING case (post-retry flow, spec §24)', async () => {
    const store = new MemoryStore();
    const f = await ingestPaymentEvent(store, failedEvent());
    store.cases[0].status = 'OBSERVING'; // simulate executor having advanced the case after retry
    const c = await ingestPaymentEvent(store, failedEvent({ providerEventId: 'rzp_cap_obs', eventType: 'payment.captured' }));
    expect(c.caseStatus).toBe('RECOVERED');
    expect(store.revenue).toHaveLength(1;
  });

  it('breaks ACTIVE promises past their promised date deterministically', async () => {
    const store = new MemoryStore();
    store.promises.push({ customerId: 'c1', status: 'ACTIVE', promised_for: new Date('2026-01-01') });
    store.promises.push({ customerId: 'c2', status: 'ACTIVE', promised_for: new Date(Date.now() + 86_400_000) });
    store.promises.push({ customerId: 'c3', status: 'FULFILLED', promised_for: new Date('2026-01-01') });
    const broken = await store.breakExpiredPromises(new Date());
    expect(broken).toBe(1);
    expect(store.promises[0].status).toBe('BROKEN');
    expect(store.promises[1].status).toBe('ACTIVE');
    expect(store.promises[2].status).toBe('FULFILLED');
  });
});

describe('computePriority (deterministic, spec §14)', () => {
  it('maps amounts to priorities', () => {
    expect(computePriority(50_000)).toBe('LOW');
    expect(computePriority(99_900)).toBe('MEDIUM');
    expect(computePriority(5_000_00)).toBe('HIGH');
  });
});

