import {
  ActionStatus,
  buildActionIdempotencyKey,
  buildEventIdempotencyKey,
  isDuplicateAction,
  RecoveryActionType,
} from '../src';

describe('Idempotency (spec §16)', () => {
  it('builds deterministic event keys', () => {
    expect(buildEventIdempotencyKey('razorpay', 'evt_123')).toBe('provider:razorpay:event:evt_123');
  });

  it('builds deterministic action keys per case+action', () => {
    expect(buildActionIdempotencyKey('case_1', 'act_9')).toBe('recovery:case_1:action:act_9');
  });

  it('detects a duplicate retry already in flight', () => {
    expect(
      isDuplicateAction(
        [{ type: RecoveryActionType.RETRY_PAYMENT, status: ActionStatus.SCHEDULED }],
        RecoveryActionType.RETRY_PAYMENT,
      ),
    ).toBe(true);
  });

  it('does not treat a resolved/cancelled action as a duplicate', () => {
    expect(
      isDuplicateAction(
        [
          { type: RecoveryActionType.RETRY_PAYMENT, status: ActionStatus.CANCELLED },
          { type: RecoveryActionType.RETRY_PAYMENT, status: ActionStatus.FAILED },
          { type: RecoveryActionType.RETRY_PAYMENT, status: ActionStatus.SUCCEEDED },
        ],
        RecoveryActionType.RETRY_PAYMENT,
      ),
    ).toBe(false);
  });

  it('different action types on the same case are not duplicates', () => {
    expect(
      isDuplicateAction(
        [{ type: RecoveryActionType.RETRY_PAYMENT, status: ActionStatus.SUCCEEDED }],
        RecoveryActionType.SEND_EMAIL,
      ),
    ).toBe(false);
  });
});