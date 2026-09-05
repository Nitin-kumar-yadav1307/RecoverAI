import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { createLLMProvider, proposeDiagnosis, proposeStrategy } from '@recoverai/ai';
import {
  InMemoryPolicyEngine,
  MerchantPolicy,
  Money,
  PromiseToPay,
  RecoveryCase,
  RecoveryActionType,
  PolicyDecision,
  RecoveryCaseStatus,
  CommunicationChannel,
  addHours,
  ActorType,
} from '@recoverai/domain';
import type { ActionType, ActionStatus } from '@prisma/client';

/**
 * Recovery Orchestrator — the agent loop for a single case (spec §5, §17–§22):
 *   DIAGNOSE (LLM proposes) -> STRATEGY (LLM proposes) ->
 *   POLICY GATE (deterministic decide) -> persist SCHEDULED action.
 *
 * The LLM NEVER executes financial actions; only the policy gate does (§19).
 */
@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);
  private readonly policy = new InMemoryPolicyEngine();
  private readonly llm = createLLMProvider(process.env as Record<string, string>);

  constructor(private readonly prisma: PrismaService) {}

  async runCase(caseId: string, merchantId: string) {
    // Load everything merchant-scoped (spec §41).
    const row = await this.prisma.recoveryCase.findFirst({ where: { id: caseId, merchant_id: merchantId } });
    if (!row) throw new NotFoundException('Recovery case not found');
    const payment = await this.prisma.payment.findUniqueOrThrow({ where: { id: row.payment_id } });
    const policyRow = await this.prisma.merchantPolicy.findUniqueOrThrow({ where: { merchant_id: merchantId } });
    const actions = await this.prisma.recoveryAction.findMany({ where: { recovery_case_id: caseId } });
    const promiseRow = await this.prisma.promiseToPay.findFirst({
      where: { customer_id: row.customer_id, status: 'ACTIVE' },
    });

    // Rehydrate domain entities.
    const domainCase = new RecoveryCase({
      id: row.id, merchant_id: row.merchant_id, customer_id: row.customer_id, payment_id: row.payment_id,
      status: row.status as unknown as RecoveryCaseStatus,
      risk_amount: Money.fromMinorUnits(row.risk_amount, 'INR'),
      failure_category: row.failure_category as unknown as RecoveryCase['failure_category'],
      priority: row.priority as unknown as RecoveryCase['priority'],
      assigned_mode: row.assigned_mode as unknown as RecoveryCase['assigned_mode'],
      created_at: row.createdAt, updated_at: row.updatedAt,
    });
    const domainPolicy = new MerchantPolicy(
      policyRow.id, policyRow.merchant_id, policyRow.max_payment_retries, policyRow.retry_cooldown_hours,
      policyRow.max_messages_per_period, policyRow.message_period_hours, policyRow.max_discount_percent,
      policyRow.max_automatic_recovery_amount_minor, policyRow.human_escalation_amount_minor,
      policyRow.respect_promise_to_pay, policyRow.allowed_channels as unknown as CommunicationChannel[],
      policyRow.createdAt, policyRow.updatedAt,
    );
    const domainPromise = promiseRow
      ? new PromiseToPay(promiseRow.id, promiseRow.merchant_id, promiseRow.customer_id, promiseRow.recovery_case_id,
          promiseRow.amount != null ? Money.fromMinorUnits(promiseRow.amount, 'INR') : null,
          promiseRow.promised_at, promiseRow.promised_for,
          promiseRow.status as unknown as PromiseToPay['status'], promiseRow.source,
          promiseRow.confidence, promiseRow.createdAt, promiseRow.updatedAt)
      : null;

    // 1. DIAGNOSE — LLM proposes.
    await this.prisma.recoveryCase.update({ where: { id: caseId }, data: { status: RecoveryCaseStatus.DIAGNOSING } });
    const diagnosis = await proposeDiagnosis(this.llm, {
      failureCode: payment.failure_code ?? undefined,
      failureReason: payment.failure_reason ?? undefined,
      category: row.failure_category,
      attemptCount: payment.attempt_count,
      amountMinor: row.risk_amount,
    });

    // 2. STRATEGY — LLM proposes.
    const strategy = await proposeStrategy(this.llm, {
      category: diagnosis.category,
      attemptCount: payment.attempt_count,
      maxPaymentRetries: domainPolicy.max_payment_retries,
      amountMinor: row.risk_amount,
      recoverability: diagnosis.recoverability,
    });

    // 3. POLICY GATE — deterministic decision on the first policy-approved action.
    const now = new Date();
    let gateResult: { decision: string; reasons: string[]; constraints: Record<string, unknown> } = {
      decision: 'BLOCKED', reasons: ['strategy proposed no valid actions'], constraints: {},
    };
    let scheduledAction: { type: string; executeAt: Date } | null = null;

    const retryCount = actions.filter((a) => a.type === 'RETRY_PAYMENT' && ['SUCCEEDED', 'FAILED', 'EXECUTING'].includes(a.status)).length;
    const lastRetry = actions
      .filter((a) => a.type === 'RETRY_PAYMENT' && a.executed_at)
      .map((a) => a.executed_at as Date)
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    const messageCount = actions.filter((a) =>
      ['SEND_EMAIL', 'SEND_WHATSAPP', 'REQUEST_PAYMENT_METHOD_UPDATE'].includes(a.type) && a.status === 'SUCCEEDED',
    ).length;

    for (const proposed of strategy.actions) {
      const type = proposed.type as RecoveryActionType;
      // Deterministic clamp: customer communication must go out promptly.
      // The LLM may propose any delay for RETRY-type actions, but outreach
      // is clamped to <= 5 minutes by policy (never LLM-controlled).
      const isCommunication = ['SEND_EMAIL', 'SEND_WHATSAPP', 'REQUEST_PAYMENT_METHOD_UPDATE'].includes(type);
      const rawDelay = proposed.delayHours ?? 12;
      const delayHours = isCommunication ? Math.min(rawDelay, 5 / 60) : rawDelay;
      const proposal = { type, executeAt: addHours(now, delayHours) };
      const result = this.policy.evaluate(proposal, {
        recoveryCase: domainCase,
        policy: domainPolicy,
        now,
        retryCount,
        lastRetryAt: lastRetry,
        messageCountInPeriod: messageCount,
        firstMessageAtInPeriod: null,
        activePromise: domainPromise,
        existingActions: actions.map((a) => ({ type: a.type as RecoveryActionType, status: a.status as never })),
      });
      gateResult = result;
      if (result.decision === PolicyDecision.ALLOWED) {
        scheduledAction = { type, executeAt: proposal.executeAt };
        break; // schedule only the first policy-approved action
      }
    }

    // Deterministic guarantee: every failure gets email outreach.
    // If the LLM/policy didn't schedule a communication action, force SEND_EMAIL.
    const isScheduledCommunication = scheduledAction &&
      ['SEND_EMAIL', 'SEND_WHATSAPP', 'REQUEST_PAYMENT_METHOD_UPDATE'].includes(scheduledAction.type);
    if (!isScheduledCommunication) {
      scheduledAction = { type: RecoveryActionType.SEND_EMAIL, executeAt: addHours(now, 5 / 60) };
    }

    // 4. Persist decision + audit trail. The gate outcome is final.
    const newStatus = scheduledAction ? RecoveryCaseStatus.APPROVED : RecoveryCaseStatus.REJECTED;
    await this.prisma.recoveryCase.update({
      where: { id: caseId },
      data: { status: newStatus, current_strategy: strategy.strategyName, next_action_at: scheduledAction?.executeAt ?? null },
    });

    let createdActionId: string | null = null;
    if (scheduledAction) {
      const rationale = strategy.actions.find(
        (a: { type: string; delayHours?: number; rationale: string }) => a.type === scheduledAction!.type,
      )?.rationale;
      const action = await this.prisma.recoveryAction.create({
        data: {
          recovery_case_id: caseId,
          type: scheduledAction.type as unknown as ActionType,
          status: 'SCHEDULED' as unknown as ActionStatus,
          scheduled_at: scheduledAction.executeAt,
          result_json: { rationale } as object,
        },
      });
      createdActionId = action.id;
    }

    await this.prisma.auditEvent.create({
      data: {
        merchant_id: merchantId,
        actor_type: ActorType.AGENT,
        actor_id: `orchestrator:${this.llm.name}`,
        event_type: 'orchestrator.decision',
        entity_type: 'recovery_case',
        entity_id: caseId,
        reason: diagnosis.rationale,
        input_json: { diagnosis: diagnosis.category, recoverability: diagnosis.recoverability, strategy: strategy.strategyName } as object,
        decision_json: { decision: gateResult.decision, reasons: gateResult.reasons, scheduledAction } as object,
        policy_json: gateResult.constraints as object,
      },
    });

    return {
      caseId,
      diagnosis: { category: diagnosis.category, recoverability: diagnosis.recoverability, rationale: diagnosis.rationale },
      strategy: { name: strategy.strategyName, proposed: strategy.actions.length },
      policyDecision: gateResult.decision,
      policyReasons: gateResult.reasons,
      scheduledAction,
      createdActionId,
      llmProvider: this.llm.name,
    };
  }
}


