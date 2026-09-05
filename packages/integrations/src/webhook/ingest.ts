import {
  FailureCategory,
  PaymentStatus,
  RecoveryCaseStatus,
  Priority,
  AssignmentMode,
  ActorType,
  buildEventIdempotencyKey,
} from '@recoverai/domain';
import { NormalizedPaymentEvent } from '../payment/types';

/**
 * Webhook ingestion — spec §16/§17: the same webhook must be processed exactly
 * once, and a failed payment must deterministically open (exactly one) recovery
 * case. A captured payment deterministically closes any open case as RECOVERED.
 *
 * The store is an interface so unit tests can use an in-memory implementation;
 * the Prisma implementation lives in the API/worker layer (STEP 5+).
 */

export interface IngestionCustomer { id: string; merchantId: string; externalCustomerId: string }
export interface IngestionPayment { id: string; merchantId: string; status: string; attemptCount: number }
export interface IngestionCase { id: string; status: string }

export interface IngestionStore {
  findEventByKey(idempotencyKey: string): Promise<{ id: string; processed: boolean } | null>;
  createEvent(input: {
    idempotencyKey: string;
    provider: string;
    eventType: string;
    payload: unknown;
    merchantId?: string;
  }): Promise<{ id: string }>;
  markEventProcessed(eventId: string, merchantId?: string): Promise<void>;
  markEventFailed(eventId: string, error: string): Promise<void>;
  findCustomer(merchantId: string, externalCustomerId: string): Promise<IngestionCustomer | null>;
  findOrCreateCustomer(merchantId: string, externalCustomerId: string): Promise<IngestionCustomer>;
  findPaymentByExternalId(externalPaymentId: string): Promise<IngestionPayment | null>;
  upsertPayment(input: {
    merchantId: string;
    customerId: string;
    externalPaymentId: string;
    amountMinor: number;
    currency: string;
    status: string;
    failureCode?: string;
    failureReason?: string;
  }): Promise<IngestionPayment>;
  findOpenCaseForPayment(paymentId: string): Promise<IngestionCase | null>;
  findOpenCaseForCustomer(customerId: string): Promise<IngestionCase | null>;
  createRecoveryCase(input: {
    merchantId: string;
    customerId: string;
    paymentId: string;
    riskAmountMinor: number;
    currency: string;
    failureCategory: FailureCategory;
  }): Promise<IngestionCase>;
  updateCaseStatus(caseId: string, status: RecoveryCaseStatus): Promise<void>;
  /** Deterministic revenue attribution — MUST be idempotent per case (unique). */
  recordRevenue(input: {
    merchantId: string;
    caseId: string;
    capturedPaymentId: string;
    amountMinor: number;
    promiseAssisted: boolean;
  }): Promise<{ recorded: boolean }>;
  /** Mark the customer's ACTIVE promise(s) FULFILLED (payment captured). */
  fulfillActivePromises(customerId: string): Promise<number>;
  /** Deterministic sweep: ACTIVE promises past their promised_for become BROKEN. */
  breakExpiredPromises(now: Date): Promise<number>;
  writeAuditEvent(input: {
    merchantId: string;
    eventType: string;
    entityType: string;
    entityId: string;
    reason?: string;
    inputJson?: unknown;
    outcomeJson?: unknown;
  }): Promise<void>;
}

export interface IngestionResult {
  duplicate: boolean;
  eventId: string;
  paymentId?: string;
  caseId?: string;
  caseStatus?: RecoveryCaseStatus;
}

/**
 * Statuses in which a case is still "live" and can be recovered by a captured
 * payment. Excludes terminal/closed states (RECOVERED, REJECTED, ESCALATED,
 * SUPPRESSED, CLOSED). A capture webhook closes any case in these states.
 */
export const OPEN_CASE_STATUSES: readonly RecoveryCaseStatus[] = [
  RecoveryCaseStatus.OPEN,
  RecoveryCaseStatus.DIAGNOSING,
  RecoveryCaseStatus.PLANNED,
  RecoveryCaseStatus.POLICY_CHECK,
  RecoveryCaseStatus.APPROVED,
  RecoveryCaseStatus.SCHEDULED,
  RecoveryCaseStatus.WAITING,
  RecoveryCaseStatus.ACTION_REQUIRED,
  RecoveryCaseStatus.IN_PROGRESS,
  RecoveryCaseStatus.EXECUTING,
  RecoveryCaseStatus.OBSERVING,
  RecoveryCaseStatus.NOT_RECOVERED,
];

/** String[] form for Prisma `in` filters. */
export const OPEN_CASE_STATUS_STRINGS: readonly string[] = OPEN_CASE_STATUSES.map((s) => String(s));

/** Priority is deterministic from risk amount (spec §14). */
export function computePriority(amountMinor: number): Priority {
  if (amountMinor >= 5_000_00) return Priority.HIGH; // >= ₹5,000
  if (amountMinor >= 99_900) return Priority.MEDIUM; // >= ₹999
  return Priority.LOW;
}

export async function ingestPaymentEvent(
  store: IngestionStore,
  event: NormalizedPaymentEvent,
): Promise<IngestionResult> {
  const idempotencyKey = buildEventIdempotencyKey(event.provider, event.providerEventId);

  // --- Idempotency gate (spec §16): same webhook processed exactly once.
  const existing = await store.findEventByKey(idempotencyKey);
  if (existing) {
    return { duplicate: true, eventId: existing.id };
  }
  const created = await store.createEvent({
    idempotencyKey,
    provider: event.provider,
    eventType: event.eventType,
    payload: event.raw,
  });

  try {
    const externalCustomerId = event.externalCustomerId ?? 'unknown';
    let customer = await store.findCustomer('', externalCustomerId);
    if (!customer) customer = await store.findOrCreateCustomer('', externalCustomerId);

    let payment = await store.findPaymentByExternalId(event.externalPaymentId);
    if (!payment) {
      payment = await store.upsertPayment({
        merchantId: customer.merchantId,
        customerId: customer.id,
        externalPaymentId: event.externalPaymentId,
        amountMinor: event.amountMinor,
        currency: event.currency,
        status: event.eventType === 'payment.captured' ? PaymentStatus.SUCCEEDED : PaymentStatus.FAILED,
        failureCode: event.failureCode,
        failureReason: event.failureReason,
      });
    }

    if (event.eventType === 'payment.captured') {
      // Success path: close any open recovery case as RECOVERED (spec §18/§40),
      // attribute revenue deterministically (once per case), fulfill promises.
      // First try matching by payment id (same payment retry), then fall back to
      // customer (e.g. customer paid via a new link after a previous failure).
      let openCase = await store.findOpenCaseForPayment(payment.id);
      if (!openCase) {
        openCase = await store.findOpenCaseForCustomer(customer.id);
      }
      if (openCase) {
        await store.updateCaseStatus(openCase.id, RecoveryCaseStatus.RECOVERED);
        await store.recordRevenue({
          merchantId: customer.merchantId,
          caseId: openCase.id,
          capturedPaymentId: payment.id,
          amountMinor: event.amountMinor,
          promiseAssisted: false,
        });
        const promisesFulfilled = await store.fulfillActivePromises(customer.id);
        await store.writeAuditEvent({
          merchantId: customer.merchantId,
          eventType: 'recovery.recovered',
          entityType: 'recovery_case',
          entityId: openCase.id,
          reason: 'payment captured',
          outcomeJson: { externalPaymentId: event.externalPaymentId, revenueAttributedMinor: event.amountMinor, promisesFulfilled },
        });
        await store.markEventProcessed(created.id, customer.merchantId);
        return { duplicate: false, eventId: created.id, paymentId: payment.id, caseId: openCase.id, caseStatus: RecoveryCaseStatus.RECOVERED };
      }
      await store.fulfillActivePromises(customer.id);
      await store.markEventProcessed(created.id, customer.merchantId);
      return { duplicate: false, eventId: created.id, paymentId: payment.id };
    }

    // Failure path: exactly one OPEN case per payment (spec §17).
    const existingCase = await store.findOpenCaseForPayment(payment.id);
    if (existingCase) {
      await store.markEventProcessed(created.id, customer.merchantId);
      return { duplicate: false, eventId: created.id, paymentId: payment.id, caseId: existingCase.id, caseStatus: RecoveryCaseStatus.OPEN };
    }
    const newCase = await store.createRecoveryCase({
      merchantId: customer.merchantId,
      customerId: customer.id,
      paymentId: payment.id,
      riskAmountMinor: event.amountMinor,
      currency: event.currency,
      failureCategory: event.failureCategory,
    });
    await store.writeAuditEvent({
      merchantId: customer.merchantId,
      eventType: 'recovery.case_opened',
      entityType: 'recovery_case',
      entityId: newCase.id,
      reason: `${event.provider} ${event.eventType}`,
      inputJson: {
        failureCategory: event.failureCategory,
        priority: computePriority(event.amountMinor),
        assignedMode: AssignmentMode.AUTONOMOUS,
        actor: ActorType.WEBHOOK,
      },
    });
    await store.markEventProcessed(created.id, customer.merchantId);
    return { duplicate: false, eventId: created.id, paymentId: payment.id, caseId: newCase.id, caseStatus: RecoveryCaseStatus.OPEN };
  } catch (e) {
    await store.markEventFailed(created.id, String(e));
    throw e;
  }
}

