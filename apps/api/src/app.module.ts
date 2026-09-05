import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { AuthService } from './auth/auth.service';
import { AuthController } from './auth/auth.controller';
import { WebhookController } from './webhook/webhook.controller';
import { PrismaIngestionStore } from './ingestion/prisma-ingestion.store';
import { OrchestratorService } from './recovery/orchestrator.service';
import { RecoveryController } from './recovery/recovery.controller';
import { ActionExecutorService } from './recovery/action-executor.service';
import { AnalyticsService } from './analytics/analytics.service';
import { AnalyticsController } from './analytics/analytics.controller';

const TOKEN_CONFIG = {
  secret: process.env.AUTH_SECRET ?? 'dev-insecure-secret',
  issuer: 'recoverai',
  expiresInSeconds: 60 * 60 * 8, // 8h sessions
};

import { RazorpayController } from './razorpay/razorpay.controller';

@Module({
  controllers: [AuthController, WebhookController, RecoveryController, AnalyticsController, RazorpayController],
  providers: [
    PrismaService,
    { provide: 'TOKEN_CONFIG', useValue: TOKEN_CONFIG },
    { provide: AuthService, useFactory: (prisma: PrismaService) => new AuthService(prisma, TOKEN_CONFIG), inject: [PrismaService] },
    PrismaIngestionStore,
    OrchestratorService,
    ActionExecutorService,
    AnalyticsService,
  ],
})
export class AppModule {}
