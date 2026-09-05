import {
  ActionStatus,
  CommunicationChannel,
  PolicyDecision,
  RecoveryActionType,
} from './enums';
import { MerchantPolicy } from './entities/merchant-policy';
import { PromiseToPay } from './entities/promise-to-pay';
import { RecoveryCase } from './entities/recovery-case';
import { isDuplicateAction } from './idempotency';

/**
 * Deterministic policy engine (spec §20, §21, §19).
 *
 * The LLM proposes an action; this engine decides whether it may execute.
 * Every rule here is deterministic. No AI is involved.
 */

export interface ActionProposal {
  type: RecoveryActionType;
  executeAt: Date;
  /** Optional discount percentage proposed by the LLM. The exact amount is computed in deterministic code. */
  discountPercent?: number;
}

export interface PolicyContext {
  recoveryCase: RecoveryCase;
  policy: MerchantPolicy;
  now: Date;
  retryCount: number;
  lastRetryAt: Date | null;
  /** Messages already sent to this customer within the policy period. */
  messageCountInPeriod: number;
  /** First message timestamp within the period (for computing elapsed). */
  firstMessageAtInPeriod: Date | null;
  activePromise: PromiseToPay | null;
  existingActions: ReadonlyArray<{ type: RecoveryActionType; status: ActionStatus }>;
}

export type PolicyResult = {
  decision: PolicyDecision;
  reasons: string[];
  constraints: Record<string, unknown>;
};

export interface PolicyEngine {
  evaluate(proposal: ActionProposal, ctx: PolicyContext): PolicyResult;
}

/** Communication channels required for each communication action type. */
export function channelsForActionType(type: RecoveryActionType): CommunicationChannel[] {
  switch (type) {
    case RecoveryActionType.SEND_EMAIL:
      return [CommunicationChannel.EMAIL];
    case RecoveryActionType.SEND_WHATSAPP:
      return [CommunicationChannel.WHATSAPP];
    case RecoveryActionType.REQUEST_PAYMENT_METHOD_UPDATE:
      return [CommunicationChannel.EMAIL, CommunicationChannel.WHATSAPP];
    default:
      return [];
  }
}

/** Whether an action type is treated as customer communication for message limits. */
function isCommunicationAction(type: RecoveryActionType): boolean {
  return (
    type === RecoveryActionType.SEND_EMAIL ||
    type === RecoveryActionType.SEND_WHATSAPP ||
    type === RecoveryActionType.REQUEST_PAYMENT_METHOD_UPDATE
  );
}

export const POLICY_TERMINAL_STATUSES: ActionStatus[] = [
  ActionStatus.SCHEDULED,
  ActionStatus.APPROVED,
  ActionStatus.EXECUTING,
  ActionStatus.SUCCEEDED,
];
export class InMemoryPolicyEngine implements PolicyEngine {
  evaluate(proposal: ActionProposal, ctx: PolicyContext): PolicyResult {
    const reasons: string[] = [];
    const constraints: Record<string, unknown> = {};

    // 1. Duplicate action guard (spec §16).
    if (isDuplicateAction(ctx.existingActions, proposal.type)) {
      reasons.push(`Duplicate action blocked: an identical '${proposal.type}' is already in flight.`);
      return { decision: PolicyDecision.BLOCKED, reasons, constraints };
    }

    // 2. Closed-case guard.
    if (ctx.recoveryCase.isClosed()) {
      reasons.push('Recovery case is already closed.');
      return { decision: PolicyDecision.BLOCKED, reasons, constraints };
    }

    const amountMinor = ctx.recoveryCase.risk_amount.amount;

    // 3. Financial safety: never exceed the automatic recovery amount (spec §20).
    if (amountMinor > ctx.policy.max_automatic_recovery_amount_minor) {
      reasons.push(
        `Amount ${amountMinor} exceeds automatic recovery limit ${ctx.policy.max_automatic_recovery_amount_minor}.`,
      );
      return { decision: PolicyDecision.ESCALATE, reasons, constraints };
    }

    // 4. Human escalation threshold (spec §20: IF amount > threshold THEN ESCALATE).
    if (amountMinor > ctx.policy.human_escalation_amount_minor) {
      reasons.push(
        `Amount ${amountMinor} exceeds human escalation threshold ${ctx.policy.human_escalation_amount_minor}.`,
      );
      return { decision: PolicyDecision.ESCALATE, reasons, constraints };
    }

    switch (proposal.type) {
      case RecoveryActionType.RETRY_PAYMENT: {
        constraints.retriesRemaining = retriesRemaining(ctx.policy, ctx.retryCount);
        if (ctx.retryCount >= ctx.policy.max_payment_retries) {
          reasons.push(
            `Payment retries exhausted: ${ctx.retryCount}/${ctx.policy.max_payment_retries}.`,
          );
          return { decision: PolicyDecision.BLOCKED, reasons, constraints };
        }
        if (ctx.lastRetryAt) {
          const cooldownUntil = addHours(ctx.lastRetryAt, ctx.policy.retry_cooldown_hours);
          if (ctx.now < cooldownUntil) {
            reasons.push(`Cooldown not satisfied until ${cooldownUntil.toISOString()}.`);
            return { decision: PolicyDecision.BLOCKED, reasons, constraints };
          }
        }
        reasons.push('Retry allowed: within limit and cooldown satisfied.');
        break;
      }

      case RecoveryActionType.SEND_EMAIL:
      case RecoveryActionType.SEND_WHATSAPP:
      case RecoveryActionType.REQUEST_PAYMENT_METHOD_UPDATE: {
        // 5. Channel allow-list.
        const required = channelsForActionType(proposal.type);
        const allowed = required.some((c) => ctx.policy.allowed_channels.includes(c));
        if (!allowed) {
          reasons.push(`Channel not allowed for '${proposal.type}'.`);
          return { decision: PolicyDecision.BLOCKED, reasons, constraints };
        }
        // 6. Message volume cap within the period.
        if (ctx.messageCountInPeriod >= ctx.policy.max_messages_per_period) {
          reasons.push(
            `Message limit reached: ${ctx.messageCountInPeriod}/${ctx.policy.max_messages_per_period} in ${ctx.policy.message_period_hours}h.`,
          );
          return { decision: PolicyDecision.BLOCKED, reasons, constraints };
        }
        // 7. Promise-to-Pay suppression (spec §7, §20).
        if (ctx.activePromise && ctx.activePromise.suppressesOutreach(proposal.executeAt)) {
          reasons.push(
            `Promise-to-pay suppresses outreach until ${ctx.activePromise.promised_for.toISOString()}.`,
          );
          return { decision: PolicyDecision.BLOCKED, reasons, constraints };
        }
        reasons.push('Communication allowed: channel and volume within policy.');
        break;
      }
case RecoveryActionType.WAIT:
      case RecoveryActionType.ESCALATE:
      case RecoveryActionType.CLOSE:
        reasons.push(`${proposal.type} is permitted by policy.`);
        break;

      default:
        reasons.push(`Unknown action type '${proposal.type}'.`);
        return { decision: PolicyDecision.BLOCKED, reasons, constraints };
    }

    constraints.retriesUsed = ctx.retryCount;
    constraints.maxRetries = ctx.policy.max_payment_retries;
    return { decision: PolicyDecision.ALLOWED, reasons, constraints };
  }
}

/** Whole hours remaining before the next retry becomes eligible, or 0. Integer-based. */
export function retriesRemaining(policy: MerchantPolicy, retryCount: number): number {
  return Math.max(0, policy.max_payment_retries - retryCount);
}

/** Add whole hours to a date; integer-only, deterministic. */
export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 3_600_000);
}

/** When the current messaging period ends, given its first message time. */
export function periodEndsAt(
  firstMessageAtInPeriod: Date | null,
  policy: MerchantPolicy,
): Date | null {
  return firstMessageAtInPeriod
    ? addHours(firstMessageAtInPeriod, policy.message_period_hours)
    : null;
}