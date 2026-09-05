import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

/**
 * Deterministic analytics — pure SQL aggregates, no AI (spec §28–§34).
 * All money is integer minor units.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async merchantAnalytics(merchantId: string) {
    const [totalCases, recovered, byCategory, revenueAgg, promiseCounts] = await Promise.all([
      this.prisma.recoveryCase.count({ where: { merchant_id: merchantId } }),
      this.prisma.recoveryCase.count({ where: { merchant_id: merchantId, status: 'RECOVERED' } }),
      this.prisma.recoveryCase.groupBy({
        by: ['failure_category'],
        where: { merchant_id: merchantId },
        _count: { _all: true },
      }),
      this.prisma.revenueLedger.aggregate({
        where: { merchant_id: merchantId },
        _sum: { amount_minor: true },
        _count: { _all: true },
      }),
      this.prisma.promiseToPay.groupBy({
        by: ['status'],
        where: { merchant_id: merchantId },
        _count: { _all: true },
      }),
    ]);

    const promises = Object.fromEntries(promiseCounts.map((p) => [p.status, p._count._all]));
    return {
      totalCases,
      recoveredCases: recovered,
      recoveryRatePct: totalCases > 0 ? Math.round((recovered / totalCases) * 1000) / 10 : 0,
      revenueRecoveredMinor: revenueAgg._sum.amount_minor ?? 0,
      revenueRecoveredInr: (revenueAgg._sum.amount_minor ?? 0) / 100,
      attributions: revenueAgg._count._all,
      byCategory: byCategory.map((c) => ({ category: c.failure_category, count: c._count._all })),
      promises: {
        active: promises['ACTIVE'] ?? 0,
        fulfilled: promises['FULFILLED'] ?? 0,
        broken: promises['BROKEN'] ?? 0,
        expired: promises['EXPIRED'] ?? 0,
      },
    };
  }
}
