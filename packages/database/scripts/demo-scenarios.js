/**
 * RecoverAI — 3 AM Risk Guard Demo Setup
 * Creates 4 distinct failed-payment scenarios to showcase policy-bound agentic behavior.
 *
 * Run:  node packages/database/scripts/demo-scenarios.js
 * Watch: tail -f /tmp/api.log
 */

const crypto = require('crypto');

const SECRET = 'Nitin@1304_razor';
const API = 'http://localhost:3001/webhooks/razorpay';

function sendWebhook(body) {
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
  return fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': sig },
    body,
  }).then(r => r.json()).catch(e => ({ error: e.message }));
}

const scenarios = [
  {
    name: 'Scenario 1 — High-Value Bank Decline (₹50,000)',
    reason: 'BANK_DECLINED',
    amount: 5000000,
    desc: 'A premium subscriber (₹50k lifetime value) hits a temporary bank decline. Risk = temporary cash flow issue.',
  },
  {
    name: 'Scenario 2 — Mid-Value Invalid Card (₹5,000)',
    reason: 'INVALID_CARD',
    amount: 500000,
    desc: 'Mid-tier subscriber using an expired/incorrect card. Risk = fixable payment method issue.',
  },
  {
    name: 'Scenario 3 — High-Value Fraudulent Decline (₹100,000)',
    reason: 'FRAUDULENT',
    amount: 10000000,
    desc: 'Large-value flagged as fraudulent. Risk = potential chargeback/fraud.',
  },
  {
    name: 'Scenario 4 — Small Insufficient Funds (₹3,000)',
    reason: 'INSUFFICIENT_FUNDS',
    amount: 300000,
    desc: 'Small subscriber with insufficient balance. Risk = likely temporary.',
  },
];

(async () => {
  console.log('🧪 RecoverAI — 3 AM Risk Guard Demo\n');
  console.log('Clearing previous non-RECOVERED cases...');
  const clear = require('./clear-demo-cases.js');
  await clear();

  for (const s of scenarios) {
    const ext = 'pay_demo_' + s.reason.toLowerCase() + '_' + Date.now();
    const body = JSON.stringify({
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: ext,
            amount: s.amount,
            currency: 'INR',
            status: 'failed',
            error_code: s.reason,
            error_description: `Simulated ${s.reason} for demo`,
            customer_id: 'demo_customer_' + s.reason,
            order_id: 'order_demo_' + ext,
          },
        },
      },
    });

    console.log(`${s.name}`);
    console.log(`  Amount: ₹${(s.amount / 100).toLocaleString('en-IN')}`);
    console.log(`  Reason: ${s.reason}`);
    console.log(`  Risk: ${s.desc}`);
    const res = await sendWebhook(body);
    console.log(`  Response: ${JSON.stringify(res)}`);
    console.log();
  }

  console.log('⏳ All scenarios sent. Watch the agent process them:');
  console.log('   tail -f /tmp/api.log');
})();