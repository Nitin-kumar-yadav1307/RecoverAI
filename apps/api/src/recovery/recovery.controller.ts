import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtGuard, principal } from '../auth/jwt.guard';
import { OrchestratorService } from './orchestrator.service';
import { ActionExecutorService } from './action-executor.service';
import { PrismaService } from '../prisma.service';
import { createLLMProvider, extractPromiseToPay } from '@recoverai/ai';

@Controller('recovery')
@UseGuards(JwtGuard)
export class RecoveryController {
  private readonly llm = createLLMProvider(process.env as Record<string, string>);

  constructor(
    private readonly orchestrator: OrchestratorService,
    private readonly executor: ActionExecutorService,
    private readonly prisma: PrismaService,
  ) {}

  /** Manually run any due scheduled actions now (backstop for the poller). */
  @Post('actions/run-due')
  async runDue(@Req() req: unknown) {
    const p = principal(req);
    const count = await this.executor.runDueActions();
    return { merchantId: p.merchantId, executed: count };
  }

  /** Merchant-scoped case list for the dashboard. */
  @Get('cases')
  async listCases(@Req() req: unknown) {
    const p = principal(req);
    const cases = await this.prisma.recoveryCase.findMany({
      where: { merchant_id: p.merchantId }, // isolation by token-derived id (spec §41)
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { customer: { select: { name: true, email: true } } },
    });
    return { cases: cases.map((c) => ({ ...c, risk_amount_inr: c.risk_amount / 100 })) };
  }

  /** Run the agent loop on one case (diagnose -> strategy -> policy gate). */
  @Post('cases/:id/run')
  async runCase(@Req() req: unknown, @Param('id') id: string) {
    const p = principal(req);
    return this.orchestrator.runCase(id, p.merchantId);
  }

  /**
   * Promise-to-Pay intake (spec §53): a customer message is understood by the
   * LLM into structured state; storage and enforcement are deterministic.
   */
  @Post('promise-to-pay')
  async promiseToPay(@Req() req: unknown, @Body() body: { customerId?: string; message?: string }) {
    const p = principal(req);
    if (!body.customerId || !body.message) throw new BadRequestException('customerId and message required');

    const customer = await this.prisma.customer.findFirst({ where: { id: body.customerId, merchant_id: p.merchantId } });
    if (!customer) throw new ForbiddenException('Customer not found for this merchant');

    const extraction = await extractPromiseToPay(this.llm, body.message);
    if (!extraction.isPromise || !extraction.promisedFor) {
      return { recorded: false, reason: 'no promise detected', confidence: extraction.confidence };
    }

    const promise = await this.prisma.promiseToPay.create({
      data: {
        merchant_id: p.merchantId,
        customer_id: customer.id,
        amount: null,
        promised_at: new Date(),
        promised_for: new Date(extraction.promisedFor),
        status: 'ACTIVE',
        source: 'customer_message',
        confidence: extraction.confidence,
      },
    });
    await this.prisma.auditEvent.create({
      data: {
        merchant_id: p.merchantId, actor_type: 'AGENT', actor_id: `promise-intake:${this.llm.name}`,
        event_type: 'promise.created', entity_type: 'promise_to_pay', entity_id: promise.id,
        reason: 'customer message', input_json: { message: extraction.sourceMessage, confidence: extraction.confidence } as object,
      },
    });
    return { recorded: true, promiseId: promise.id, promisedFor: extraction.promisedFor, confidence: extraction.confidence };
  }
}
