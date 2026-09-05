import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  PaymentProvider,
  RazorpayPaymentProvider,
  MockPaymentProvider,
} from '@recoverai/integrations';
import { buildActionIdempotencyKey } from '@recoverai/domain';
import { createMessagingProvider, buildRecoveryEmail } from '@recoverai/integrations';
import type { RecoveryAction, ActionStatus as PrismaActionStatus } from '@prisma/client';

/**
 * Action Executor — the "EXECUTE" step of the agent loop (§5, §24).
 *
 * A lightweight poller picks up SCHEDULED actions whose scheduled_at has
 * arrived and executes them:
 *   - RETRY_PAYMENT  -> real Razorpay retry (or mock when PAYMENT_PROVIDER=mock)
 *   - SEND_* / REQUEST_* -> simulator (no real email/sms provider yet)
 *   - ESCALATE / CLOSE   -> terminal bookkeeping
 *
 * Outcomes are persisted (action status + result), audited, and the case is
 * advanced (e.g. RETRY_PAYMENT initiated -> case OBSERVING, awaiting the
 * payment.captured webhook to flip it RECOVERED). Only deterministic code
 * executes actions here — never the LLM (§19).
 */
@Injectable()
export class ActionExecutorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ActionExecutorService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  private readonly messages = createMessagingProvider(process.env as Record<string, string>);

  private buildPaymentProvider(): PaymentProvider {
    const provider = process.env.PAYMENT_PROVIDER ?? 'razorpay';
    if (provider === 'mock') {
      return new MockPaymentProvider();
    }
    const keyId = process.env.RAZORPAY_KEY_ID ?? '';
    const keySecret = process.env.RAZORPAY_KEY_SECRET ?? '';
    if (!keyId || !keySecret) {
      this.logger.warn('RAZORPAY keys missing; falling back to mock payment provider');
      return new MockPaymentProvider();
    }
    return new RazorpayPaymentProvider(keyId, keySecret);
  }

  onModuleInit() {
    const pollMs = Number(process.env.ACTION_POLL_MS ?? 15_000);
    this.timer = setInterval(async () => {
      try {
        await this.runDueActions();
      } catch (e) {
        this.logger.error(`runDueActions failed: ${String(e)}`, String(e));
      }
    }, pollMs);
    setTimeout(() => { void this.runDueActions().catch((e) => this.logger.error(String(e))); }, 1000);
    this.logger.log(`Action executor started (poll ${pollMs}ms, provider=${process.env.PAYMENT_PROVIDER ?? 'razorpay'})`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Find and execute due SCHEDULED actions. */
  async runDueActions(): Promise<number> {
    const now = new Date();
    const due = await this.prisma.recoveryAction.findMany({
      where: { status: 'SCHEDULED', scheduled_at: { lte: now } },
      include: { recoveryCase: { include: { payment: true, customer: { select: { name: true, email: true } } } } },
      take: 50,
    });
    for (const action of due) {
      try {
        await this.execute(action as never);
      } catch (e) {
        this.logger.error(`Failed to execute action ${action.id}: ${String(e)}`, String(e));
      }
    }
    return due.length;
  }

  private async execute(action: RecoveryAction & { recoveryCase: { merchant_id: string; payment: { id: string; external_payment_id: string; attempt_count: number }; customer: { name: string; email: string | null } } }) {
    await this.prisma.recoveryAction.update({ where: { id: action.id }, data: { status: 'EXECUTING' } });

    let outcome: { ok: boolean; result: Record<string, unknown> };
    try {
      switch (action.type) {
        case 'RETRY_PAYMENT':
          outcome = await this.executeRetryPayment(action);
          break;
        case 'SEND_EMAIL':
          outcome = await this.executeSendEmail(action);
          break;
        case 'SEND_WHATSAPP':
        case 'REQUEST_PAYMENT_METHOD_UPDATE':
          outcome = { ok: true, result: { channel: 'simulated' } }; // simulator only (no real provider yet)
          break;
        case 'ESCALATE':
        case 'CLOSE':
          outcome = { ok: true, result: { note: `${action.type} recorded by executor` } };
          break;
        case 'WAIT':
          outcome = { ok: true, result: { note: 'wait action acknowledged' } };
          break;
        default:
          outcome = { ok: false, result: { error: `unsupported action type ${action.type}` } };
      }
    } catch (e) {
      outcome = { ok: false, result: { error: String(e) } };
    }

    const finalStatus: PrismaActionStatus = outcome.ok ? 'SUCCEEDED' : 'FAILED';
    await this.prisma.recoveryAction.update({
      where: { id: action.id },
      data: { status: finalStatus, executed_at: new Date(), result_json: outcome.result as object },
    });

    await this.prisma.auditEvent.create({
      data: {
        merchant_id: action.recoveryCase.merchant_id,
        actor_type: 'AGENT',
        actor_id: 'action-executor',
        event_type: `action.${outcome.ok ? 'succeeded' : 'failed'}`,
        entity_type: 'recovery_action',
        entity_id: action.id,
        reason: `${action.type} executed`,
        outcome_json: outcome.result as object,
      },
    });
    this.logger.log(`Executed action ${action.id} (${action.type}) -> ${finalStatus}`);
    return outcome;
  }

  private async executeRetryPayment(
    action: RecoveryAction & { recoveryCase: { payment: { id: string; external_payment_id: string } } },
  ) {
    const caseId = action.recovery_case_id;
    const row = await this.prisma.recoveryCase.findUniqueOrThrow({ where: { id: caseId } });
    const payment = action.recoveryCase.payment;

    const provider = this.buildPaymentProvider();
    const resp = await provider.retryPayment({
      externalPaymentId: payment.external_payment_id,
      amountMinor: row.risk_amount,
      idempotencyKey: buildActionIdempotencyKey(caseId, action.id),
    });

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { attempt_count: { increment: 1 } },
    });

    if (resp.status === 'INITIATED') {
      // Await the payment.captured webhook to close the case. Advance to OBSERVING.

      await this.prisma.recoveryCase.update({
        where: { id: caseId },
        data: { status: 'OBSERVING', next_action_at: null },
      });
      return { ok: true, result: { providerRetryId: resp.providerRetryId, status: 'INITIATED' } };
    }
    return { ok: false, result: { status: 'FAILED', reason: resp.failureReason ?? 'retry declined' } };
  }

  /** Send a branded recovery email via the messaging provider (Resend real / mock). */
  private async executeSendEmail(
    action: RecoveryAction & { recoveryCase: { payment: { external_payment_id: string }; customer: { name: string; email: string | null } } },
  ) {
    void action; // action fields typed via helpers below
    const caseId = action.recovery_case_id;
    const caseRow = await this.prisma.recoveryCase.findUniqueOrThrow({
      where: { id: caseId },
      include: { payment: true },
    });
    const customer = action.recoveryCase.customer;

    if (!customer.email) {
      return { ok: false, result: { error: 'customer has no email on file' } };
    }
    const email = buildRecoveryEmail({
      customerName: customer.name ?? 'Customer',
      amountInr: caseRow.risk_amount / 100,
      externalPaymentId: action.recoveryCase.payment.external_payment_id,
      reasoning: {
        failureReason: caseRow.payment?.failure_reason ?? null,
        strategyName: caseRow.current_strategy ?? null,
        actionRationale:
          ((action.result_json as { rationale?: string } | null)?.rationale) ?? null,
      },
    });
    const res = await this.messages.sendEmail({ to: customer.email, subject: email.subject, html: email.html });
    return res.ok
      ? { ok: true, result: { provider: res.provider, messageId: res.messageId } }
      : { ok: false, result: { provider: res.provider, error: res.error } };
  }
}