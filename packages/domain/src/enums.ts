/**
 * Domain-wide enumerations for RecoverAI.
 *
 * These mirror the Prisma enums in `packages/database` but live here so the
 * domain layer has zero dependency on the database/ORM.
 */

/** Currencies supported. Amounts are always stored as integer minor units. */
export type Currency = 'INR';

export enum MerchantStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  PENDING = 'PENDING',
}

export enum CustomerStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  BLOCKED = 'BLOCKED',
}

export enum SubscriptionStatus {
  TRIALING = 'TRIALING',
  ACTIVE = 'ACTIVE',
  PAST_DUE = 'PAST_DUE',
  PAUSED = 'PAUSED',
  CANCELED = 'CANCELED',
  EXPIRED = 'EXPIRED',
}

export enum PaymentStatus {
  AUTHORIZED = 'AUTHORIZED',
  PENDING = 'PENDING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
  CANCELLED = 'CANCELLED',
}

/**
 * Failure categories produced by the Diagnosis engine.
 * See spec §13 (§RecoveryCase.failure_category) and §49 evaluation scenarios.
 */
export enum FailureCategory {
  TEMPORARY_BANK_ISSUE = 'TEMPORARY_BANK_ISSUE',
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  EXPIRED_CARD = 'EXPIRED_CARD',
  CARD_DECLINED = 'CARD_DECLINED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  PAYMENT_METHOD_INVALID = 'PAYMENT_METHOD_INVALID',
  PAYMENT_METHOD_EXPIRED = 'PAYMENT_METHOD_EXPIRED',
  DO_NOT_HONOR = 'DO_NOT_HONOR',
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  RISK_FRAUD = 'RISK_FRAUD',
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  HIGH_RISK = 'HIGH_RISK',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Recovery case lifecycle status. See spec §37 for the state machine.
 */
export enum RecoveryCaseStatus {
  OPEN = 'OPEN',
  DIAGNOSING = 'DIAGNOSING',
  PLANNED = 'PLANNED',
  POLICY_CHECK = 'POLICY_CHECK',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  SCHEDULED = 'SCHEDULED',
  WAITING = 'WAITING',
  ACTION_REQUIRED = 'ACTION_REQUIRED',
  IN_PROGRESS = 'IN_PROGRESS',
  EXECUTING = 'EXECUTING',
  OBSERVING = 'OBSERVING',
  NOT_RECOVERED = 'NOT_RECOVERED',
  RECOVERED = 'RECOVERED',
  ESCALATED = 'ESCALATED',
  SUPPRESSED = 'SUPPRESSED',
  CLOSED = 'CLOSED',
}

export enum RecoveryActionType {
  RETRY_PAYMENT = 'RETRY_PAYMENT',
  SEND_EMAIL = 'SEND_EMAIL',
  SEND_WHATSAPP = 'SEND_WHATSAPP',
  REQUEST_PAYMENT_METHOD_UPDATE = 'REQUEST_PAYMENT_METHOD_UPDATE',
  WAIT = 'WAIT',
  ESCALATE = 'ESCALATE',
  CLOSE = 'CLOSE',
}

export enum ActionStatus {
  DRAFT = 'DRAFT',
  SCHEDULED = 'SCHEDULED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  BLOCKED = 'BLOCKED',
  EXECUTING = 'EXECUTING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export enum PolicyDecision {
  ALLOWED = 'ALLOWED',
  BLOCKED = 'BLOCKED',
  ESCALATE = 'ESCALATE',
  MANUAL_REVIEW = 'MANUAL_REVIEW',
}

export enum PromiseStatus {
  ACTIVE = 'ACTIVE',
  FULFILLED = 'FULFILLED',
  BROKEN = 'BROKEN',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

export enum Priority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum AssignmentMode {
  AUTONOMOUS = 'AUTONOMOUS',
  MANUAL = 'MANUAL',
  HYBRID = 'HYBRID',
}

export enum CommunicationChannel {
  EMAIL = 'EMAIL',
  WHATSAPP = 'WHATSAPP',
  SMS = 'SMS',
}

export enum ActorType {
  USER = 'USER',
  AGENT = 'AGENT',
  SYSTEM = 'SYSTEM',
  CUSTOMER = 'CUSTOMER',
  WEBHOOK = 'WEBHOOK',
}