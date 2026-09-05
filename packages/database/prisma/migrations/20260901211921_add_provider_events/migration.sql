-- CreateTable
CREATE TABLE "provider_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "merchant_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "provider_events_idempotency_key_key" ON "provider_events"("idempotency_key");

-- CreateIndex
CREATE INDEX "provider_events_provider_event_type_idx" ON "provider_events"("provider", "event_type");
