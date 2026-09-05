import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../prisma.service';

/**
 * Razorpay order creation — used by the embedded checkout UI.
 * The frontend calls this to get an order_id, then opens Razorpay Checkout.
 */
@Controller('razorpay')
export class RazorpayController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('create-order')
  async createOrder(@Body() body: { amountMinor: number; currency?: string; receipt?: string }) {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) throw new Error('Razorpay keys not configured');

    const amount = body.amountMinor ?? 249900;
    const currency = body.currency ?? 'INR';

    const res = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64'),
      },
      body: JSON.stringify({ amount, currency, receipt: body.receipt || `rcpt_${Date.now()}` }),
    });

    const order = await res.json() as { id: string; amount: number; currency: string; error?: { description: string } };
    if (order.error) throw new Error(order.error.description || 'Order creation failed');
    return { orderId: order.id, amount: order.amount, currency: order.currency, keyId };
  }
}
