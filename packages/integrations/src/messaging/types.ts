/**
 * Messaging provider abstraction — sends recovery outreach to customers.
 * No business logic depends on Resend directly; only on this interface (§51).
 * Real impl: ResendEmailProvider. Simulator: MockMessagingProvider (tests/local).
 */

export interface EmailInput {
  to: string;
  subject: string;
  html: string;
}

export interface MessagingResult {
  ok: boolean;
  provider: string;
  messageId?: string;
  error?: string;
}

export interface MessagingProvider {
  readonly name: string;
  sendEmail(input: EmailInput): Promise<MessagingResult>;
}