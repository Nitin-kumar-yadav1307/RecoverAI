/**
 * Clears previous demo data (cases, actions, events) for a clean Risk Guard demo.
 * Keeps RECOVERED cases and real customer data intact.
 */

const { PrismaClient } = require('@prisma/client');

module.exports = async function clearDemoCases() {
  const prisma = new PrismaClient();
  try {
    // Mark all non-RECOVERED cases for the demo customer as deleted
    await prisma.recoveryCase.updateMany({
      where: {
        customer_id: { startsWith: 'demo_customer_' },
        status: { not: 'RECOVERED' },
      },
      data: { status: 'DELETED' },
    });

    // Clean up related demo-only entities
    await prisma.$executeRawUnsafe(`
      DELETE FROM "AuditEvent"
      WHERE correlation_id IN (
        SELECT id FROM "RecoveryCase" WHERE customer_id LIKE 'demo_customer_%'
      )
    `);

    // Reset the payment failed webhook for demo customers (avoid idempotency dupes)
    await prisma.$executeRawUnsafe(`
      DELETE FROM "ProviderEvent"
      WHERE payload::text LIKE '%"demo_customer_%'
    `);

    console.log('✅ Demo data cleared — fresh slate');
  } catch (e) {
    console.error('⚠️  Clear warning:', e.message);
  } finally {
    await prisma.$disconnect();
  }
};
