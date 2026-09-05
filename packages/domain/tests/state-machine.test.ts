import {
  AssignmentMode,
  FailureCategory,
  InvalidStateTransitionError,
  Money,
  Priority,
  RecoveryCase,
  RecoveryCaseStatus,
} from '../src';

function makeCase(status: RecoveryCaseStatus): RecoveryCase {
  return new RecoveryCase({
    id: 'case_1',
    merchant_id: 'merch_1',
    customer_id: 'cus_1',
    payment_id: 'pay_1',
    status,
    risk_amount: Money.fromMajorUnits(999),
    failure_category: FailureCategory.INSUFFICIENT_FUNDS,
    priority: Priority.MEDIUM,
    assigned_mode: AssignmentMode.AUTONOMOUS,
  });
}

describe('Recovery case state machine (spec §37)', () => {
  it('follows the happy path to RECOVERED and CLOSED', () => {
    const c = makeCase(RecoveryCaseStatus.OPEN);
    c.transition(RecoveryCaseStatus.DIAGNOSING);
    c.transition(RecoveryCaseStatus.PLANNED);
    c.transition(RecoveryCaseStatus.POLICY_CHECK);
    c.transition(RecoveryCaseStatus.APPROVED);
    c.transition(RecoveryCaseStatus.SCHEDULED);
    c.transition(RecoveryCaseStatus.EXECUTING);
    c.transition(RecoveryCaseStatus.OBSERVING);
    c.transition(RecoveryCaseStatus.RECOVERED);
    c.transition(RecoveryCaseStatus.CLOSED);
    expect(c.status).toBe(RecoveryCaseStatus.CLOSED);
    expect(c.closed_at).not.toBeNull();
    expect(c.isClosed()).toBe(true);
  });

  it('rejects an illegal transition', () => {
    const c = makeCase(RecoveryCaseStatus.OPEN);
    expect(() => c.transition(RecoveryCaseStatus.RECOVERED)).toThrow(
      InvalidStateTransitionError,
    );
  });

  it('does not allow transition out of a terminal state', () => {
    const c = makeCase(RecoveryCaseStatus.CLOSED);
    expect(c.isClosed()).toBe(true);
    expect(() => c.transition(RecoveryCaseStatus.PLANNED)).toThrow(
      InvalidStateTransitionError,
    );
  });

  it('sets closed_at when reaching a terminal state', () => {
    const c = makeCase(RecoveryCaseStatus.OBSERVING);
    c.transition(RecoveryCaseStatus.NOT_RECOVERED);
    c.transition(RecoveryCaseStatus.CLOSED, new Date('2026-09-02T00:00:00Z'));
    expect(c.closed_at?.toISOString()).toBe('2026-09-02T00:00:00.000Z');
  });
});