import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtGuard, principal } from '../auth/jwt.guard';
import { AnalyticsService } from './analytics.service';
import { PrismaIngestionStore } from '../ingestion/prisma-ingestion.store';

@Controller('recovery/analytics')
@UseGuards(JwtGuard)
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly store: PrismaIngestionStore,
  ) {}

  /** Merchant-scoped recovery analytics (deterministic, spec §28–§34). */
  @Get()
  async getAnalytics(@Req() req: unknown) {
    const p = principal(req);
    const [data] = await Promise.all([
      this.analytics.merchantAnalytics(p.merchantId),
      this.store.breakExpiredPromises(new Date()), // deterministic promise sweep on read
    ]);
    return data;
  }
}
