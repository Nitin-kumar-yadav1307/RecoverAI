/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '@recoverai/auth/dist/password';

/**
 * Deterministic seed data for local development and the demo.
 * Creates a merchant, its policy, demo customers, subscriptions, a failed
 * payment, and an open recovery case.
 *
 * Demo merchant login:
 *   email:    demo@acme.in
 *   password: demo1234
 */
const prisma = new PrismaClient();

async function upsertMerchant() {
  const passwordHash = await hashPassword('demo1234');
  const merchant = await prisma.merchant.upsert({
    where: { email: 'demo@acme.in' },
    update: { passwordHash },
    create: {
      name: 'Acme SaaS',
      email: 'demo@acme.in',
      passwordHash,
      currency: 'INR',
      timezone: 'Asia/Kolkata',
      status: 'ACTIVE',
    },
  });

  await prisma.merchantPolicy.upsert({
    where: { merchant_id: merchant.id },
    update: {},
    create: {
      merchant_id: merchant.id,
      max_payment_retries: 3,
      retry_cooldown_hours: 12,
      max_messages_per_period: 2,
      message_period_hours: 168,
      max_discount_percent: 0,
      max_automatic_recovery_amount_minor: 2_000_000, // ₹20,000
      human_escalation_amount_minor: 2_000_000, // ₹20,000
      respect_promise_to_pay: true,
      allowed_channels: ['EMAIL', 'WHATSAPP'],
    },
  });

  return merchant;
}

const FIXED_NOW = new Date('2026-09-01T09:00:00+05:30'); // 2026-09-01 09:00 IST

async function seedCustomer(merchantId: string, name: string, externalId: string) {
  // Resend sandbox mode only delivers to the account owner's address, so the
  // demo customers all use it to make live email outreach visible in the inbox.
  const email = process.env.DEMO_INBOX_EMAIL || 'senkuishigami8675@gmail.com';
  return prisma.customer.upsert({
    where: { id: `cus_${externalId}` },
    update: { email },
    create: {
      id: `cus_${externalId}`,
      merchant_id: merchantId,
      external_customer_id: externalId,
      name,
      email,
      status: 'ACTIVE',
      timezone: 'Asia/Kolkata',
    },
  });
}

async function seedRecoveryScenario(merchantId: string, customerId: string, index: number) {
  const amount = 99_900; // ₹999
  const payment = await prisma.payment.upsert({
    where: { external_payment_id: `pay_demo_${index}` },
    update: {},
    create: {
      merchant_id: merchantId,
      customer_id: customerId,
      external_payment_id: `pay_demo_${index}`,
      subscription_id: null,
      amount,
      currency: 'INR',
      status: 'FAILED',
      failure_code: 'NAK',
      failure_reason: 'Insufficient funds',
      attempt_count: 1,
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    },
  });

  const recoveryCase = await prisma.recoveryCase.upsert({
    where: { id: `rc_demo_${index}` },
    update: {},
    create: {
      id: `rc_demo_${index}`,
      merchant_id: merchantId,
      customer_id: customerId,
      payment_id: payment.id,
      status: 'OPEN',
      risk_amount: amount,
      currency: 'INR',
      failure_category: 'INSUFFICIENT_FUNDS',
      priority: 'MEDIUM',
      assigned_mode: 'AUTONOMOUS',
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    },
  });

  return { payment, recoveryCase };
}

async function main() {
  const merchant = await upsertMerchant();

  const rahul = await seedCustomer(merchant.id, 'Rahul', 'rahul');
  const priya = await seedCustomer(merchant.id, 'Priya', 'priya');
  const amit = await seedCustomer(merchant.id, 'Amit', 'amit');

  await seedRecoveryScenario(merchant.id, rahul.id, 1);
  await seedRecoveryScenario(merchant.id, priya.id, 2);
  await seedRecoveryScenario(merchant.id, amit.id, 3);

  // A promise-to-pay demo case (spec §53).
  await prisma.promiseToPay.upsert({
    where: { id: 'ptp_demo_priya' },
    update: {},
    create: {
      id: 'ptp_demo_priya',
      merchant_id: merchant.id,
      customer_id: priya.id,
      recovery_case_id: null,
      amount: 299_900, // ₹2,999
      promised_at: FIXED_NOW,
      promised_for: new Date('2026-09-04T09:00:00+05:30'), // Friday
      status: 'ACTIVE',
      source: 'customer_message',
      confidence: 0.97,
    },
  });

  console.log('Seed complete:', { merchantId: merchant.id });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });