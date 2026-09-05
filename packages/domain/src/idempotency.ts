import { ActionStatus, RecoveryActionType } from './enums';

/**
 * Idempotency helpers.
 *
 * Spec §16: the same webhook must be processed exactly once, and the same
 * recovery action must not be executed twice. We build deterministic keys here
 * and validate against the action idempotency registry.
 */

/** Key identifying a unique provider event (e.g. a Razorpay event id). */
export function buildEventIdempotencyKey(provider: string, providerEventId: string): string {
  return `provider:${provider}:event:${providerEventId}`;
}

/** Key identifying a specific recovery action for a case (spec §16). */
export function buildActionIdempotencyKey(caseId: string, actionId: string): string {
  return `recovery:${caseId}:action:${actionId}`;
}

/**
 * Deterministic pre-execution guard: reject an action if an identical,
 * still-in-flight action already exists on the case. Terminal outcomes
 * (SUCCEEDED / FAILED / CANCELLED) do not block — a follow-up action of
 * the same type is a new action, not a re-execution (spec §16); message
 * caps bound its frequency.
 */
export function isDuplicateAction(
  existingActions: ReadonlyArray<{
    type: RecoveryActionType;
    status: ActionStatus;
  }>,
  candidateType: RecoveryActionType,
): boolean {
  return existingActions.some(
    (a) =>
      a.type === candidateType &&
      ['SCHEDULED', 'APPROVED', 'EXECUTING'].includes(a.status),
  );
}