import { BadRequestException, Body, Controller, Headers, Logger, Post, Req } from '@nestjs/common';
import { RazorpayPaymentProvider, ingestPaymentEvent } from '@recoverai/integrations';
import { PrismaIngestionStore } from '../ingestion/prisma-ingestion.store';
import { OrchestratorService } from '../recovery/orchestrator.service';
import { PrismaService } from '../prisma.service';

/**
 * Razorpay webhook endpoint (spec §16, §51).
 * Verifies the HMAC signature over the RAW body BEFORE any parsing.
 *
 * When a NEW recovery case is opened by a failed payment, the agent loop runs
 * automatically (see `ORCHESTRATE_ON_OPEN`). The webhook is acknowledged even
 * if the agent later fails — the case remains OPEN and can be re-run from the
 * dashboard.
 */
@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);
  private razorpay: RazorpayPaymentProvider | null = null;

  constructor(
    private readonly store: PrismaIngestionStore,
    private readonly orchestrator: OrchestratorService,
    private readonly prisma: PrismaService,
  ) {}

  private provider(): RazorpayPaymentProvider {
    if (!this.razorpay) {
      const keyId = process.env.RAZORPAY_KEY_ID ?? '';
      const keySecret = process.env.RAZORPAY_KEY_SECRET ?? '';
      if (!keyId || !keySecret) {
        throw new BadRequestException('Payment provider not configured (missing RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET)');
      }
      this.razorpay = new RazorpayPaymentProvider(keyId, keySecret);
    }
    return this.razorpay;
  }

  @Post('razorpay')
  async razorpayWebhook(
    @Req() req: { rawBody?: Buffer },
    @Headers('x-razorpay-signature') signature: string | undefined,
    @Body() _parsed: unknown, // parsed JSON (unused) — HMAC is over raw bytes only
  ) {
    const raw = req.rawBody?.toString('utf8') ?? '';
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET ?? '';
    const provider = this.provider();

    // 1. Signature verification FIRST — reject before trusting parsed data (spec §16).
    if (!secret || !signature || !provider.verifyWebhookSignature(raw, signature, secret)) {
      // Log every rejected attempt — a silent 400 is impossible to debug.
      this.logger.warn(
        `Webhook REJECTED (bad signature). hasSecret=${!!secret} hasSignature=${!!signature} ` +
        `expectedPrefix=${secret.slice(0, 4)}*** rawLen=${raw.length} bodyPreview=${raw.slice(0, 200)}`,
      );
      throw new BadRequestException('Invalid webhook signature');
    }

    // 2. Parse + 3. Idempotent ingestion.
    const event = provider.parseWebhookEvent(raw);
    this.logger.log(`Webhook ACCEPTED: ${event.eventType} payment=${event.externalPaymentId}`);
    const result = await ingestPaymentEvent(this.store, event);

    // 4. Auto-run the agent when a NEW recovery case was opened by this failure.
    if (
      event.eventType === 'payment.failed' &&
      result.caseId &&
      !result.duplicate &&
      result.caseStatus === 'OPEN'
    ) {
      try {
        const row = await this.prisma.recoveryCase.findUnique({ where: { id: result.caseId } });
        if (row) {
          const agent = await this.orchestrator.runCase(row.id, row.merchant_id);
          this.logger.log(`Auto-orchestrated case ${row.id}: ${agent.policyDecision} via ${agent.llmProvider}`);
        }
      } catch (e) {
        // The webhook is still acknowledged; ingestion succeeded. Surface for dashboard/manual run.
        this.logger.error(`Auto-orchestration failed for case ${result.caseId}: ${String(e)}`, String(e));
      }
    }

    return { ok: true, duplicate: result.duplicate, caseId: result.caseId, caseStatus: result.caseStatus };
  }
}
