import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  IngestionStore,
  computePriority,
  OPEN_CASE_STATUSES,
} from '@recoverai/integrations';
import { FailureCategory, RecoveryCaseStatus } from '@recoverai/domain';

/** Production Prisma-backed ingestion store (spec §16). */
@Injectable()
export class PrismaIngestionStore implements IngestionStore {
  constructor(private readonly prisma: PrismaService) {}

  async findEventByKey(key: string) {
    const e = await this.prisma.providerEvent.findUnique({ where: { idempotency_key: key } });
    return e ? { id: e.id, processed: e.processed } : null;
  }

  async createEvent(i: { idempotencyKey: string; provider: string; eventType: string; payload: unknown; merchantId?: string }) {
    const e = await this.prisma.providerEvent.create({
      data: { idempotency_key: i.idempotencyKey, provider: i.provider, event_type: i.eventType, payload: i.payload as object, merchant_id: i.merchantId },
    });
    return { id: e.id };
  }

  async markEventProcessed(id: string, merchantId?: string) {
    await this.prisma.providerEvent.update({ where: { id }, data: { processed: true, merchant_id: merchantId } });
  }

  async markEventFailed(id: string, error: string) {
    await this.prisma.providerEvent.update({ where: { id }, data: { error } });
  }

  async findCustomer(merchantId: string, externalCustomerId: string) {
    const c = await this.prisma.customer.findFirst({ where: { merchant_id: merchantId, external_customer_id: externalCustomerId } });
    return c ? { id: c.id, merchantId: c.merchant_id, externalCustomerId: c.external_customer_id } : null;
  }

  /**
   * Resolve the owning merchant for an inbound webhook. Webhooks carry no
   * merchant id in this build, so an empty merchant id resolves to the demo
   * merchant (single-tenant). This is deterministic and keeps the customer
   * record FK-valid. Spec §41 merchant isolation is still honored everywhere
   * a JWT principal exists.
   */
  async resolveMerchantId(merchantId: string): Promise<string> {
    if (merchantId) return merchantId;
    const m = await this.prisma.merchant.findFirst({ where: { email: process.env.DEMO_MERCHANT_EMAIL ?? 'demo@acme.in' } });
    if (!m) throw new Error('No merchant to attribute webhook to; run the seed first');
    return m.id;
  }

  async findOrCreateCustomer(merchantId: string, externalCustomerId: string) {
    const ownerId = await this.resolveMerchantId(merchantId);
    const found = await this.findCustomer(ownerId, externalCustomerId);
    if (found) return found;
    const c = await this.prisma.customer.create({
      data: {
        merchant_id: ownerId,
        external_customer_id: externalCustomerId,
        name: `Customer ${externalCustomerId}`,
        // Razorpay webhooks don't carry an email; fall back to the demo inbox so
        // Resend sandbox mode can deliver outreach (see seed.ts).
        email: process.env.DEMO_INBOX_EMAIL || 'senkuishigami8675@gmail.com',
        status: 'ACTIVE',
      },
    });
    return { id: c.id, merchantId: c.merchant_id, externalCustomerId: c.external_customer_id };
  }

  async findPaymentByExternalId(externalPaymentId: string) {
    const p = await this.prisma.payment.findUnique({ where: { external_payment_id: externalPaymentId } });
    return p ? { id: p.id, merchantId: p.merchant_id, status: p.status, attemptCount: p.attempt_count } : null;
  }

  async upsertPayment(i: {
    merchantId: string; customerId: string; externalPaymentId: string; amountMinor: number;
    currency: string; status: string; failureCode?: string; failureReason?: string;
  }) {
    const p = await this.prisma.payment.upsert({
      where: { external_payment_id: i.externalPaymentId },
      update: { status: i.status as never, failure_code: i.failureCode, failure_reason: i.failureReason },
      create: {
        merchant_id: i.merchantId, customer_id: i.customerId, external_payment_id: i.externalPaymentId,
        amount: i.amountMinor, currency: 'INR', status: i.status as never,
        failure_code: i.failureCode, failure_reason: i.failureReason,
      },
    });
    return { id: p.id, merchantId: p.merchant_id, status: p.status, attemptCount: p.attempt_count };
  }

  async findOpenCaseForPayment(paymentId: string) {
    const c = await this.prisma.recoveryCase.findFirst({
      where: { payment_id: paymentId, status: { in: [...OPEN_CASE_STATUSES] as RecoveryCaseStatus[] } },
    });
    return c ? { id: c.id, status: c.status } : null;
  }

  async findOpenCaseForCustomer(customerId: string) {
    const c = await this.prisma.recoveryCase.findFirst({
      where: { customer_id: customerId, status: { in: [...OPEN_CASE_STATUSES] as RecoveryCaseStatus[] } },
      orderBy: { createdAt: 'desc' },
    });
    return c ? { id: c.id, status: c.status } : null;
  }

  async createRecoveryCase(i: {
    merchantId: string; customerId: string; paymentId: string;
    riskAmountMinor: number; currency: string; failureCategory: FailureCategory;
  }) {
    const c = await this.prisma.recoveryCase.create({
      data: {
        merchant_id: i.merchantId, customer_id: i.customerId, payment_id: i.paymentId,
        status: RecoveryCaseStatus.OPEN, risk_amount: i.riskAmountMinor, currency: 'INR',
        failure_category: i.failureCategory, priority: computePriority(i.riskAmountMinor),
        assigned_mode: 'AUTONOMOUS',
      },
    });
    return { id: c.id, status: c.status };
  }

  async updateCaseStatus(caseId: string, status: RecoveryCaseStatus) {
    await this.prisma.recoveryCase.update({ where: { id: caseId }, data: { status } });
  }

  async recordRevenue(i: {
    merchantId: string; caseId: string; capturedPaymentId: string;
    amountMinor: number; promiseAssisted: boolean;
  }) {
    const existing = await this.prisma.revenueLedger.findUnique({ where: { recovery_case_id: i.caseId } });
    if (existing) return { recorded: false };
    await this.prisma.revenueLedger.create({
      data: {
        merchant_id: i.merchantId, recovery_case_id: i.caseId,
        captured_payment_id: i.capturedPaymentId, amount_minor: i.amountMinor,
        promise_assisted: i.promiseAssisted,
      },
    });
    return { recorded: true };
  }

  async fulfillActivePromises(customerId: string) {
    const r = await this.prisma.promiseToPay.updateMany({
      where: { customer_id: customerId, status: 'ACTIVE' },
      data: { status: 'FULFILLED', updatedAt: new Date() },
    });
    return r.count;
  }

  async breakExpiredPromises(now: Date) {
    const r = await this.prisma.promiseToPay.updateMany({
      where: { status: 'ACTIVE', promised_for: { lt: now } },
      data: { status: 'BROKEN', updatedAt: now },
    });
    return r.count;
  }

  async writeAuditEvent(i: {
    merchantId: string; eventType: string; entityType: string; entityId: string;
    reason?: string; inputJson?: unknown; outcomeJson?: unknown;
  }) {
    await this.prisma.auditEvent.create({
      data: {
        merchant_id: i.merchantId, actor_type: 'WEBHOOK', actor_id: 'webhook-ingest',
        event_type: i.eventType, entity_type: i.entityType, entity_id: i.entityId,
        reason: i.reason, input_json: (i.inputJson ?? undefined) as never, outcome_json: (i.outcomeJson ?? undefined) as never,
      },
    });
  }
}
