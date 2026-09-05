import {
  ActionStatus,
  AssignmentMode,
  CommunicationChannel,
  FailureCategory,
  MerchantPolicy,
  Money,
  PolicyDecision,
  Priority,
  PromiseToPay,
  PromiseStatus,
  RecoveryActionType,
  RecoveryCase,
  RecoveryCaseStatus,
  InMemoryPolicyEngine,
  PolicyContext,
} from '../src';

function makePolicy(overrides: Partial<MerchantPolicy> = {}): MerchantPolicy {
  const d = {
    max_payment_retries: 3,
    retry_cooldown_hours: 12,
    max_messages_per_period: 2,
    message_period_hours: 168,
    max_discount_percent: 0,
    max_automatic_recovery_amount_minor: 2_000_000, // ₹20,000
    human_escalation_amount_minor: 2_000_000, // ₹20,000
    respect_promise_to_pay: true,
    allowed_channels: [CommunicationChannel.EMAIL, CommunicationChannel.WHATSAPP],
  } as const;
  return new MerchantPolicy(
    'pol_1',
    'merch_1',
    overrides.max_payment_retries ?? d.max_payment_retries,
    overrides.retry_cooldown_hours ?? d.retry_cooldown_hours,
    overrides.max_messages_per_period ?? d.max_messages_per_period,
    overrides.message_period_hours ?? d.message_period_hours,
    overrides.max_discount_percent ?? d.max_discount_percent,
    overrides.max_automatic_recovery_amount_minor ?? d.max_automatic_recovery_amount_minor,
    overrides.human_escalation_amount_minor ?? d.human_escalation_amount_minor,
    overrides.respect_promise_to_pay ?? d.respect_promise_to_pay,
    overrides.allowed_channels ?? [...d.allowed_channels],
    new Date('2026-09-01T00:00:00Z'),
    new Date('2026-09-01T00:00:00Z'),
  );
}

function makeCase(amountMinor = 99_900): RecoveryCase {
  return new RecoveryCase({
    id: 'case_1',
    merchant_id: 'merch_1',
    customer_id: 'cus_1',
    payment_id: 'pay_1',
    status: RecoveryCaseStatus.OPEN,
    risk_amount: Money.fromMinorUnits(amountMinor),
    failure_category: FailureCategory.INSUFFICIENT_FUNDS,
    priority: Priority.MEDIUM,
    assigned_mode: AssignmentMode.AUTONOMOUS,
  });
}

function baseCtx(overrides: Partial<PolicyContext> = {}): PolicyContext {
  return {
    recoveryCase: makeCase(),
    policy: makePolicy(),
    now: new Date('2026-09-01T00:00:00Z'),
    retryCount: 0,
    lastRetryAt: null,
    messageCountInPeriod: 0,
    firstMessageAtInPeriod: null,
    activePromise: null,
    existingActions: [],
    ...overrides,
  };
}

const engine = new InMemoryPolicyEngine();

describe('Policy engine: retry limits (spec §20)', () => {
  it('allows the third retry (retryCount 2 < max 3)', () => {
    const result = engine.evaluate(
      { type: RecoveryActionType.RETRY_PAYMENT, executeAt: new Date('2026-09-01T01:00:00Z') },
      baseCtx({ retryCount: 2, lastRetryAt: null }), // no prior retry => no cooldown conflict
    );
    expect(result.decision).toBe(PolicyDecision.ALLOWED);
  });

  it('blocks the fourth retry (retryCount 3 >= max 3)', () => {
    const result = engine.evaluate(
      { type: RecoveryActionType.RETRY_PAYMENT, executeAt: new Date('2026-09-02T00:00:00Z') },
      baseCtx({ retryCount: 3, lastRetryAt: new Date('2026-09-01T00:00:00Z') }),
    );
    expect(result.decision).toBe(PolicyDecision.BLOCKED);
    expect(result.reasons.join(' ')).toMatch(/exhausted/i);
  });

  it('blocks a retry inside the cooldown window', () => {
    const result = engine.evaluate(
      { type: RecoveryActionType.RETRY_PAYMENT, executeAt: new Date('2026-09-01T05:00:00Z') },
      baseCtx({
        retryCount: 1,
        lastRetryAt: new Date('2026-09-01T00:00:00Z'),
        now: new Date('2026-09-01T05:00:00Z'),
      }),
    );
    expect(result.decision).toBe(PolicyDecision.BLOCKED);
    expect(result.reasons.join(' ')).toMatch(/cooldown/i);
  });

  it('allows a retry after the cooldown window', () => {
    const result = engine.evaluate(
      { type: RecoveryActionType.RETRY_PAYMENT, executeAt: new Date('2026-09-01T13:00:00Z') },
      baseCtx({
        retryCount: 1,
        lastRetryAt: new Date('2026-09-01T00:00:00Z'),
        now: new Date('2026-09-01T13:00:00Z'),
      }),
    );
    expect(result.decision).toBe(PolicyDecision.ALLOWED);
  });
});

describe('Policy engine: promise-to-pay suppression (spec §7, §20)', () => {
  function activePromise(promisedFor: Date): PromiseToPay {
    return new PromiseToPay(
      'prom_1',
      'merch_1',
      'cus_1',
      'case_1',
      Money.fromMajorUnits(2999),
      new Date('2026-09-01T00:00:00Z'),
      promisedFor,
      PromiseStatus.ACTIVE,
      'customer_message',
      0.97,
      new Date(),
      new Date(),
    );
  }

  it('blocks email before the promised date', () => {
    const promise = activePromise(new Date('2026-09-04T00:00:00Z'));
    const result = engine.evaluate(
      { type: RecoveryActionType.SEND_EMAIL, executeAt: new Date('2026-09-02T00:00:00Z') },
      baseCtx({ activePromise: promise }),
    );
    expect(result.decision).toBe(PolicyDecision.BLOCKED);
    expect(result.reasons.join(' ')).toMatch(/promise/i);
  });

  it('allows outreach on/after the promised date when still unpaid', () => {
    const promise = activePromise(new Date('2026-09-04T00:00:00Z'));
    const result = engine.evaluate(
      { type: RecoveryActionType.SEND_EMAIL, executeAt: new Date('2026-09-04T12:00:00Z') },
      baseCtx({ activePromise: promise }),
    );
    expect(result.decision).toBe(PolicyDecision.ALLOWED);
  });
});
describe('Policy engine: high-value escalation (spec §20)', () => {
  it('escalates an amount above the automatic recovery limit', () => {
    const ctx = baseCtx({ recoveryCase: makeCase(5_000_000) }); // ₹50,000
    const result = engine.evaluate(
      { type: RecoveryActionType.RETRY_PAYMENT, executeAt: new Date('2026-09-01T01:00:00Z') },
      ctx,
    );
    expect(result.decision).toBe(PolicyDecision.ESCALATE);
  });
});

describe('Policy engine: message limits and channels (spec §20)', () => {
  it('blocks WhatsApp when channel is not allowed', () => {
    const policy = makePolicy({ allowed_channels: [CommunicationChannel.EMAIL] });
    const result = engine.evaluate(
      { type: RecoveryActionType.SEND_WHATSAPP, executeAt: new Date('2026-09-01T01:00:00Z') },
      baseCtx({ policy }),
    );
    expect(result.decision).toBe(PolicyDecision.BLOCKED);
    expect(result.reasons.join(' ')).toMatch(/channel/i);
  });

  it('blocks a message over the per-period limit', () => {
    const result = engine.evaluate(
      { type: RecoveryActionType.SEND_EMAIL, executeAt: new Date('2026-09-01T01:00:00Z') },
      baseCtx({
        messageCountInPeriod: 2,
        firstMessageAtInPeriod: new Date('2026-09-01T00:00:00Z'),
      }),
    );
    expect(result.decision).toBe(PolicyDecision.BLOCKED);
    expect(result.reasons.join(' ')).toMatch(/message limit/i);
  });
});

describe('Policy engine: duplicate action guard (spec §16)', () => {
  it('blocks a duplicate retry already in flight', () => {
    const result = engine.evaluate(
      { type: RecoveryActionType.RETRY_PAYMENT, executeAt: new Date('2026-09-01T01:00:00Z') },
      baseCtx({
        existingActions: [{ type: RecoveryActionType.RETRY_PAYMENT, status: ActionStatus.SCHEDULED }],
      }),
    );
    expect(result.decision).toBe(PolicyDecision.BLOCKED);
    expect(result.reasons.join(' ')).toMatch(/duplicate/i);
  });
});