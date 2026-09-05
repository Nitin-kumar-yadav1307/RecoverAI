-- CreateEnum
CREATE TYPE "MerchantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'PENDING');

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'PAUSED', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('AUTHORIZED', 'PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FailureCategory" AS ENUM ('TEMPORARY_BANK_ISSUE', 'INSUFFICIENT_FUNDS', 'EXPIRED_CARD', 'CARD_DECLINED', 'NETWORK_ERROR', 'PAYMENT_METHOD_INVALID', 'PAYMENT_METHOD_EXPIRED', 'DO_NOT_HONOR', 'AUTHENTICATION_FAILED', 'RISK_FRAUD', 'PROVIDER_ERROR', 'HIGH_RISK', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "RecoveryCaseStatus" AS ENUM ('OPEN', 'DIAGNOSING', 'PLANNED', 'POLICY_CHECK', 'APPROVED', 'REJECTED', 'SCHEDULED', 'WAITING', 'ACTION_REQUIRED', 'IN_PROGRESS', 'EXECUTING', 'OBSERVING', 'NOT_RECOVERED', 'RECOVERED', 'ESCALATED', 'SUPPRESSED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ActionType" AS ENUM ('RETRY_PAYMENT', 'SEND_EMAIL', 'SEND_WHATSAPP', 'REQUEST_PAYMENT_METHOD_UPDATE', 'WAIT', 'ESCALATE', 'CLOSE');

-- CreateEnum
CREATE TYPE "ActionStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'APPROVED', 'REJECTED', 'BLOCKED', 'EXECUTING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PolicyDecision" AS ENUM ('ALLOWED', 'BLOCKED', 'ESCALATE', 'MANUAL_REVIEW');

-- CreateEnum
CREATE TYPE "PromiseStatus" AS ENUM ('ACTIVE', 'FULFILLED', 'BROKEN', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AssignmentMode" AS ENUM ('AUTONOMOUS', 'MANUAL', 'HYBRID');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('EMAIL', 'WHATSAPP', 'SMS');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'AGENT', 'SYSTEM', 'CUSTOMER', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('INR');

-- CreateTable
CREATE TABLE "merchants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'INR',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "status" "MerchantStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "external_customer_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "external_subscription_id" TEXT NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'INR',
    "billing_interval" TEXT NOT NULL DEFAULT 'monthly',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "next_billing_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "subscription_id" TEXT,
    "external_payment_id" TEXT NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'INR',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "failure_code" TEXT,
    "failure_reason" TEXT,
    "attempt_count" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recovery_cases" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "status" "RecoveryCaseStatus" NOT NULL DEFAULT 'OPEN',
    "risk_amount_minor" INTEGER NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'INR',
    "failure_category" "FailureCategory" NOT NULL,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "current_strategy" TEXT,
    "next_action_at" TIMESTAMP(3),
    "assigned_mode" "AssignmentMode" NOT NULL DEFAULT 'AUTONOMOUS',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "recovery_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recovery_actions" (
    "id" TEXT NOT NULL,
    "recovery_case_id" TEXT NOT NULL,
    "type" "ActionType" NOT NULL,
    "status" "ActionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "reason" TEXT,
    "parameters_json" JSONB,
    "policy_decision" JSONB,
    "scheduled_at" TIMESTAMP(3),
    "executed_at" TIMESTAMP(3),
    "result_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recovery_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_policies" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "max_payment_retries" INTEGER NOT NULL DEFAULT 3,
    "retry_cooldown_hours" INTEGER NOT NULL DEFAULT 12,
    "max_messages_per_period" INTEGER NOT NULL DEFAULT 2,
    "message_period_hours" INTEGER NOT NULL DEFAULT 168,
    "max_discount_percent" INTEGER NOT NULL DEFAULT 0,
    "max_automatic_recovery_amount_minor" INTEGER NOT NULL DEFAULT 2000000,
    "human_escalation_amount_minor" INTEGER NOT NULL DEFAULT 2000000,
    "respect_promise_to_pay" BOOLEAN NOT NULL DEFAULT true,
    "allowed_channels" "Channel"[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchant_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promise_to_pay" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "recovery_case_id" TEXT,
    "amount_minor" INTEGER,
    "promised_at" TIMESTAMP(3) NOT NULL,
    "promised_for" TIMESTAMP(3) NOT NULL,
    "status" "PromiseStatus" NOT NULL DEFAULT 'ACTIVE',
    "source" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promise_to_pay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "actor_type" "ActorType" NOT NULL,
    "actor_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "reason" TEXT,
    "input_json" JSONB,
    "decision_json" JSONB,
    "policy_json" JSONB,
    "outcome_json" JSONB,
    "correlation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "merchants_email_key" ON "merchants"("email");

-- CreateIndex
CREATE INDEX "customers_merchant_id_external_customer_id_idx" ON "customers"("merchant_id", "external_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_external_subscription_id_key" ON "subscriptions"("external_subscription_id");

-- CreateIndex
CREATE INDEX "subscriptions_merchant_id_customer_id_idx" ON "subscriptions"("merchant_id", "customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_external_payment_id_key" ON "payments"("external_payment_id");

-- CreateIndex
CREATE INDEX "payments_merchant_id_customer_id_idx" ON "payments"("merchant_id", "customer_id");

-- CreateIndex
CREATE INDEX "recovery_cases_merchant_id_status_idx" ON "recovery_cases"("merchant_id", "status");

-- CreateIndex
CREATE INDEX "recovery_cases_merchant_id_customer_id_idx" ON "recovery_cases"("merchant_id", "customer_id");

-- CreateIndex
CREATE INDEX "recovery_cases_next_action_at_idx" ON "recovery_cases"("next_action_at");

-- CreateIndex
CREATE INDEX "recovery_actions_recovery_case_id_type_status_idx" ON "recovery_actions"("recovery_case_id", "type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "merchant_policies_merchant_id_key" ON "merchant_policies"("merchant_id");

-- CreateIndex
CREATE INDEX "promise_to_pay_customer_id_status_idx" ON "promise_to_pay"("customer_id", "status");

-- CreateIndex
CREATE INDEX "audit_events_merchant_id_entity_type_entity_id_idx" ON "audit_events"("merchant_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_events_merchant_id_event_type_idx" ON "audit_events"("merchant_id", "event_type");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_cases" ADD CONSTRAINT "recovery_cases_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_cases" ADD CONSTRAINT "recovery_cases_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_cases" ADD CONSTRAINT "recovery_cases_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_actions" ADD CONSTRAINT "recovery_actions_recovery_case_id_fkey" FOREIGN KEY ("recovery_case_id") REFERENCES "recovery_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_policies" ADD CONSTRAINT "merchant_policies_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promise_to_pay" ADD CONSTRAINT "promise_to_pay_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promise_to_pay" ADD CONSTRAINT "promise_to_pay_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promise_to_pay" ADD CONSTRAINT "promise_to_pay_recovery_case_id_fkey" FOREIGN KEY ("recovery_case_id") REFERENCES "recovery_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
