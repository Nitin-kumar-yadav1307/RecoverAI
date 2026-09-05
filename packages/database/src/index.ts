import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

export * from '@prisma/client';

/** Convenience helper: value stored as integer minor units. */
export const minor = (majorUnits: number): number => Math.round(majorUnits * 100);