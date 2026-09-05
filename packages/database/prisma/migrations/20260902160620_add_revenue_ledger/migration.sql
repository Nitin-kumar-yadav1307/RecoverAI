-- CreateTable
CREATE TABLE "revenue_ledger" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "recovery_case_id" TEXT NOT NULL,
    "captured_payment_id" TEXT NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "promise_assisted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revenue_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "revenue_ledger_recovery_case_id_key" ON "revenue_ledger"("recovery_case_id");

-- CreateIndex
CREATE INDEX "revenue_ledger_merchant_id_idx" ON "revenue_ledger"("merchant_id");
